"""Static site audit tool for generated experiences.

This script inspects the built output directory for missing pages, broken links,
switcher integration, routes consistency, asset references, and template
similarities. Results are written to both Markdown and JSON reports for humans
and machines.
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import importlib
import importlib.util
import json
import os
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional, Sequence
from urllib.parse import urlparse

bs4_spec = importlib.util.find_spec("bs4")
BeautifulSoup = None if bs4_spec is None else importlib.import_module("bs4").BeautifulSoup  # type: ignore

yaml_spec = importlib.util.find_spec("yaml")
yaml = None if yaml_spec is None else importlib.import_module("yaml")  # type: ignore


SEVERITY_ORDER = ["BLOCKER", "MAJOR", "MINOR", "INFO"]


def _git_sha() -> Optional[str]:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return result.stdout.strip()
    except Exception:
        return None


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def _is_external_href(href: str) -> bool:
    parsed = urlparse(href)
    return bool(parsed.scheme and parsed.scheme not in ("", "file"))


def _resolve_local_path(base: Path, href: str, out_root: Path) -> tuple[Optional[Path], Optional[str]]:
    parsed = urlparse(href)
    fragment = parsed.fragment or None
    if parsed.scheme or parsed.netloc:
        return None, fragment
    if href.startswith("#"):
        return base, fragment
    if href.startswith("/"):
        target = out_root / href.lstrip("/")
    else:
        target = (base.parent / parsed.path).resolve()
    if target.is_dir():
        index_candidate = target / "index.html"
        if index_candidate.exists():
            target = index_candidate
    elif not target.suffix and target.exists():
        pass
    elif not target.suffix:
        html_candidate = Path(str(target) + ".html")
        if html_candidate.exists():
            target = html_candidate
    return target if target.exists() else None, fragment


def _path_label(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except Exception:
        return str(path)


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_yaml(path: Path) -> list[dict]:
    if not yaml:
        raise RuntimeError("PyYAML is required to load experiences.yaml")
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _load_content_items(content_dir: Path) -> list[dict]:
    items: list[dict] = []
    for path in sorted(content_dir.glob("*.json")):
        try:
            items.append(_load_json(path))
        except Exception as exc:
            raise RuntimeError(f"Failed to parse content JSON {path}: {exc}") from exc
    return items


def _soup_from_html(path: Path) -> Optional["BeautifulSoup"]:
    if not BeautifulSoup:
        return None
    try:
        return BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    except Exception:
        return None


def _dom_signature(soup: "BeautifulSoup") -> tuple[list[str], set[str], set[str], Counter]:
    tags: list[str] = []
    classes: set[str] = set()
    ids: set[str] = set()
    tag_counter: Counter = Counter()

    def walk(node):
        from bs4 import Tag  # type: ignore

        if isinstance(node, Tag):
            tags.append(node.name)
            tag_counter[node.name] += 1
            classes.update(node.get("class", []))
            if "id" in node.attrs:
                ids.add(node["id"])
            for child in node.children:
                walk(child)

    walk(soup.body or soup)
    return tags, classes, ids, tag_counter


@dataclass
class Finding:
    severity: str
    type: str
    title: str
    evidence: dict
    suggested_next_step: str = ""
    id: int = field(default=0)


class Auditor:
    def __init__(
        self,
        *,
        out_dir: Path,
        routes_path: Optional[Path],
        experiences_path: Optional[Path],
        content_dir: Path,
        report_dir: Path,
    ) -> None:
        self.out_dir = out_dir
        self.routes_path = routes_path
        self.experiences_path = experiences_path
        self.content_dir = content_dir
        self.report_dir = report_dir
        self.findings: list[Finding] = []
        self.finding_counter = 1
        self.meta: dict = {}
        self.experiences: list[dict] = []
        self.content_items: list[dict] = []
        self.routes_payload: Optional[dict] = None
        self.parser = "beautifulsoup4" if BeautifulSoup else "html.parser (limited)"

    def add_finding(
        self,
        *,
        severity: str,
        type_: str,
        title: str,
        evidence: dict,
        suggested_next_step: str = "",
    ) -> None:
        finding = Finding(
            id=self.finding_counter,
            severity=severity,
            type=type_,
            title=title,
            evidence=evidence,
            suggested_next_step=suggested_next_step,
        )
        self.finding_counter += 1
        self.findings.append(finding)

    def load_inputs(self) -> None:
        if self.experiences_path:
            self.experiences = _load_yaml(self.experiences_path)
        if self.routes_path and self.routes_path.exists():
            try:
                self.routes_payload = _load_json(self.routes_path)
            except Exception as exc:
                self.add_finding(
                    severity="BLOCKER",
                    type_="ROUTES_MISMATCH",
                    title="routes.json could not be parsed",
                    evidence={"path": str(self.routes_path), "error": str(exc)},
                    suggested_next_step="Fix malformed routes.json or regenerate via sitegen build --all.",
                )
        self.content_items = _load_content_items(self.content_dir)

    def collect_meta(self, command: str) -> None:
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        sha = _git_sha()
        self.meta = {
            "executedAt": now,
            "python": sys.version,
            "git": {"sha": sha} if sha else {},
            "outDir": str(self.out_dir),
            "command": command,
            "parser": self.parser,
        }

    def _generated_experiences(self) -> list[dict]:
        return [exp for exp in self.experiences if exp.get("kind") == "generated"]

    def _content_by_experience(self) -> dict[str, list[dict]]:
        grouped: dict[str, list[dict]] = defaultdict(list)
        for item in self.content_items:
            grouped[item.get("experience", "")].append(item)
        return grouped

    def check_generated_outputs(self) -> None:
        content_by_exp = self._content_by_experience()
        for exp in self._generated_experiences():
            output_dir = exp.get("output_dir")
            if not output_dir:
                continue
            home_path = self.out_dir / output_dir / "index.html"
            list_path = self.out_dir / output_dir / "list" / "index.html"
            if not home_path.exists():
                self.add_finding(
                    severity="BLOCKER",
                    type_="MISSING_PAGE",
                    title=f"Home page missing for {exp['key']}",
                    evidence={"expected": str(home_path)},
                    suggested_next_step="Run sitegen build for this experience and ensure output_dir is correct.",
                )
            if not list_path.exists():
                self.add_finding(
                    severity="BLOCKER",
                    type_="MISSING_PAGE",
                    title=f"List page missing for {exp['key']}",
                    evidence={"expected": str(list_path)},
                    suggested_next_step="Verify list template renders and output path is correct.",
                )
            for item in content_by_exp.get(exp["key"], []):
                slug = item.get("contentId")
                detail_path = self.out_dir / output_dir / "posts" / slug / "index.html"
                if not detail_path.exists():
                    self.add_finding(
                        severity="BLOCKER",
                        type_="MISSING_PAGE",
                        title=f"Detail page missing for {exp['key']} slug={slug}",
                        evidence={"expected": str(detail_path)},
                        suggested_next_step="Check slug resolution and ensure build generated detail pages.",
                    )

        shared_paths = [
            self.out_dir / "shared" / "switcher.js",
            self.out_dir / "shared" / "switcher.css",
            self.out_dir / "shared" / "features" / "init-features.js",
        ]
        for path in shared_paths:
            if not path.exists():
                self.add_finding(
                    severity="BLOCKER",
                    type_="MISSING_ASSET",
                    title=f"Shared asset missing: {path.name}",
                    evidence={"expected": str(path)},
                    suggested_next_step="Re-run sitegen build --all to emit shared assets.",
                )

    def check_routes(self) -> None:
        if not self.routes_payload:
            return
        routes = self.routes_payload.get("routes", {})
        for exp_key, payload in routes.items():
            for key in ("home", "list"):
                route_path = payload.get(key)
                if not route_path:
                    continue
                resolved, _ = _resolve_local_path(
                    self.out_dir / "dummy", route_path, self.out_dir
                )
                if not resolved:
                    self.add_finding(
                        severity="BLOCKER",
                        type_="ROUTES_MISMATCH",
                        title=f"{exp_key} {key} route does not resolve",
                        evidence={"route": route_path},
                        suggested_next_step="Ensure route paths point to generated files and include trailing slash where needed.",
                    )
                elif not resolved.exists():
                    self.add_finding(
                        severity="BLOCKER",
                        type_="ROUTES_MISMATCH",
                        title=f"{exp_key} {key} route missing target file",
                        evidence={"route": route_path, "resolved": str(resolved)},
                        suggested_next_step="Regenerate site or adjust routePaths to include index.html destinations.",
                    )
                else:
                    try:
                        resolved.resolve().relative_to(self.out_dir.resolve())
                    except ValueError:
                        self.add_finding(
                            severity="MAJOR",
                            type_="ROUTES_OUTSIDE_OUTDIR",
                            title=f"{exp_key} {key} route points outside output directory",
                            evidence={
                                "route": route_path,
                                "resolved": str(resolved),
                                "outDir": str(self.out_dir),
                            },
                            suggested_next_step="Adjust route paths or publish legacy pages inside the build output so switcher targets are in the same root.",
                        )
            content_routes = payload.get("content", {}) or {}
            for slug, route_path in content_routes.items():
                resolved, _ = _resolve_local_path(
                    self.out_dir / "dummy", route_path, self.out_dir
                )
                if not resolved or not resolved.exists():
                    self.add_finding(
                        severity="BLOCKER",
                        type_="ROUTES_MISMATCH",
                        title=f"{exp_key} content route missing for {slug}",
                        evidence={"route": route_path, "resolved": str(resolved) if resolved else None},
                        suggested_next_step="Ensure content items are generated and routes.json matches the output structure.",
                    )
                else:
                    try:
                        resolved.resolve().relative_to(self.out_dir.resolve())
                    except ValueError:
                        self.add_finding(
                            severity="MAJOR",
                            type_="ROUTES_OUTSIDE_OUTDIR",
                            title=f"{exp_key} content route points outside output directory",
                            evidence={
                                "route": route_path,
                                "resolved": str(resolved),
                                "outDir": str(self.out_dir),
                            },
                            suggested_next_step="Keep switcher targets under the published root or host legacy files alongside the generated output.",
                        )

    def _html_targets(self) -> list[Path]:
        targets: list[Path] = []
        legacy_candidates = [Path("index.html"), Path("story1.html")]
        for path in legacy_candidates:
            if path.exists():
                targets.append(path.resolve())
        for exp in self._generated_experiences():
            output_dir = exp.get("output_dir")
            if not output_dir:
                continue
            base = self.out_dir / output_dir
            home = base / "index.html"
            lst = base / "list" / "index.html"
            if home.exists():
                targets.append(home)
            if lst.exists():
                targets.append(lst)
            items = [item for item in self.content_items if item.get("experience") == exp["key"]]
            if items:
                slug = items[0].get("contentId")
                detail = base / "posts" / slug / "index.html"
                if detail.exists():
                    targets.append(detail)
        return targets

    def _collect_ids(self, soup: "BeautifulSoup") -> set[str]:
        ids: set[str] = set()
        for tag in soup.find_all(True):
            if "id" in tag.attrs:
                ids.add(tag["id"])
        return ids

    def crawl_links(self) -> None:
        targets = self._html_targets()
        for html_path in targets:
            soup = _soup_from_html(html_path)
            if not soup:
                self.add_finding(
                    severity="MAJOR",
                    type_="PARSE_ERROR",
                    title=f"Unable to parse HTML for link crawl: {html_path}",
                    evidence={"file": str(html_path)},
                    suggested_next_step="Verify HTML is well-formed or rerun with beautifulsoup4 installed.",
                )
                continue
            ids = self._collect_ids(soup)
            for a_tag in soup.find_all("a", href=True):
                href = a_tag.get("href", "")
                if not href or href.startswith("javascript:"):
                    continue
                parsed = urlparse(href)
                fragment = parsed.fragment
                if _is_external_href(href):
                    continue
                target, frag = _resolve_local_path(html_path, href, self.out_dir)
                if href.startswith("#"):
                    if fragment and fragment not in ids:
                        self.add_finding(
                            severity="MAJOR",
                            type_="BROKEN_LINK",
                            title="Anchor target missing",
                            evidence={
                                "from": str(html_path),
                                "href": href,
                                "missingAnchor": fragment,
                            },
                            suggested_next_step="Add the target id or update the anchor href.",
                        )
                    continue
                if target is None or not target.exists():
                    self.add_finding(
                        severity="BLOCKER",
                        type_="BROKEN_LINK",
                        title="Broken internal link",
                        evidence={
                            "from": str(html_path),
                            "href": href,
                            "resolved": str(target) if target else None,
                        },
                        suggested_next_step="Fix relative paths or ensure destination files are generated.",
                    )
                elif frag and frag not in ids and target == html_path:
                    self.add_finding(
                        severity="MAJOR",
                        type_="BROKEN_LINK",
                        title="Self-anchor missing",
                        evidence={
                            "from": str(html_path),
                            "href": href,
                            "missingAnchor": frag,
                        },
                        suggested_next_step="Add the anchor id or adjust the href.",
                    )

    def check_switcher(self) -> None:
        targets = self._html_targets()
        for html_path in targets:
            soup = _soup_from_html(html_path)
            if not soup:
                continue
            body = soup.body
            has_button = bool(
                soup.find(attrs={"data-action": "switch-experience"})
                or soup.find(string=lambda s: s and "体験を切り替える" in s)
            )
            has_css = any(
                "switcher" in (link.get("href") or "")
                for link in soup.find_all("link", href=True)
            )
            has_js = any(
                "switcher" in (script.get("src") or "")
                for script in soup.find_all("script", src=True)
            )
            if not (has_button and has_css and has_js):
                self.add_finding(
                    severity="MAJOR",
                    type_="SWITCHER_MISSING",
                    title=f"Switcher assets/button missing in {html_path.name}",
                    evidence={
                        "file": str(html_path),
                        "button": has_button,
                        "css": has_css,
                        "js": has_js,
                    },
                    suggested_next_step="Ensure legacy pages are patched and switcher assets are included.",
                )
            if body and body.has_attr("data-routes-href"):
                routes_href = body.get("data-routes-href")
                target, _ = _resolve_local_path(html_path, routes_href, self.out_dir)
                if not target or not target.exists():
                    self.add_finding(
                        severity="BLOCKER",
                        type_="SWITCHER_CONFIG_INVALID",
                        title="routes.json reference from switcher is invalid",
                        evidence={
                            "file": str(html_path),
                            "routesHref": routes_href,
                            "resolved": str(target) if target else None,
                        },
                        suggested_next_step="Update data-routes-href to point at generated/routes.json relative to the HTML file.",
                    )
            else:
                self.add_finding(
                    severity="MAJOR",
                    type_="SWITCHER_CONFIG_INVALID",
                    title="Switcher data attributes missing on body",
                    evidence={"file": str(html_path)},
                    suggested_next_step="Ensure body has data-routes-href and data-experience attributes for the switcher.",
                )

    def check_template_similarity(self) -> None:
        homes: dict[str, tuple[list[str], set[str], set[str], Counter]] = {}
        for exp in self._generated_experiences():
            output_dir = exp.get("output_dir")
            home_path = self.out_dir / output_dir / "index.html"
            soup = _soup_from_html(home_path)
            if soup:
                homes[exp["key"]] = _dom_signature(soup)
        keys = list(homes.keys())
        for i, key_a in enumerate(keys):
            for key_b in keys[i + 1 :]:
                sig_a = homes[key_a]
                sig_b = homes[key_b]
                ratio = difflib.SequenceMatcher(
                    None, sig_a[0], sig_b[0]
                ).ratio()
                if ratio >= 0.95:
                    self.add_finding(
                        severity="MAJOR",
                        type_="TEMPLATES_NOT_DIFFERENT_ENOUGH",
                        title=f"{key_a} and {key_b} home pages are structurally identical",
                        evidence={
                            "similarity": ratio,
                            "tagsA": len(sig_a[0]),
                            "tagsB": len(sig_b[0]),
                            "classOverlap": len(sig_a[1].intersection(sig_b[1])),
                            "idOverlap": len(sig_a[2].intersection(sig_b[2])),
                            "tagCountsA": sig_a[3],
                            "tagCountsB": sig_b[3],
                        },
                        suggested_next_step="Differentiate templates to match each experience concept (layout, component mix, or class structure).",
                    )

    def check_missing_sections(self) -> None:
        required_ids = {"about", "episodes", "characters"}
        for exp in self._generated_experiences():
            home_path = self.out_dir / exp.get("output_dir", "") / "index.html"
            soup = _soup_from_html(home_path)
            if not soup:
                continue
            ids = self._collect_ids(soup)
            missing = sorted(required_ids - ids)
            if missing:
                self.add_finding(
                    severity="MINOR",
                    type_="MISSING_SECTION",
                    title=f"{exp['key']} home missing sections",
                    evidence={"file": str(home_path), "missingIds": missing},
                    suggested_next_step="Add required sections or anchors (about/episodes/characters) to align with legacy navigation.",
                )

    def check_branding(self) -> None:
        generated = self._generated_experiences()
        expected_labels = {
            exp["key"]: (exp.get("name") or exp["key"]).lower() for exp in generated
        }
        alternative_labels = {
            exp["key"]: {
                (other.get("name") or other["key"]).lower()
                for other in generated
                if other["key"] != exp["key"]
            }
            for exp in generated
        }
        for exp in generated:
            output_dir = exp.get("output_dir")
            if not output_dir:
                continue
            for rel, page_type in (("index.html", "home"), ("list/index.html", "list")):
                path = self.out_dir / output_dir / rel
                soup = _soup_from_html(path)
                if not soup:
                    continue
                title_text = (soup.title.string or "").strip() if soup.title else ""
                head_texts = [title_text]
                for meta in soup.find_all("meta"):
                    content_val = meta.get("content")
                    if content_val:
                        head_texts.append(content_val)
                combined = " ".join(head_texts).lower()
                expected = expected_labels.get(exp["key"], "")
                hits = [alt for alt in alternative_labels.get(exp["key"], set()) if alt in combined]
                if expected and expected not in combined:
                    self.add_finding(
                        severity="MAJOR",
                        type_="BRANDING_MISMATCH",
                        title=f"{exp['key']} {page_type} missing experience branding",
                        evidence={
                            "file": str(path),
                            "expectedLabel": expected,
                            "observedTitle": title_text,
                            "otherLabelsPresent": hits,
                        },
                        suggested_next_step="Inject the experience-specific name/description into page titles and hero metadata for each template.",
                    )
                elif hits:
                    self.add_finding(
                        severity="MAJOR",
                        type_="BRANDING_MISMATCH",
                        title=f"{exp['key']} {page_type} mixes other experience branding",
                        evidence={
                            "file": str(path),
                            "expectedLabel": expected,
                            "observedTitle": title_text,
                            "otherLabelsPresent": hits,
                        },
                        suggested_next_step="Ensure templates pull labels from the current experience instead of shared defaults.",
                    )

    def check_assets(self) -> None:
        targets = self._html_targets()
        for html_path in targets:
            soup = _soup_from_html(html_path)
            if not soup:
                continue
            asset_tags = list(soup.find_all("link", href=True)) + list(
                soup.find_all("script", src=True)
            )
            for tag in asset_tags:
                href = tag.get("href") or tag.get("src")
                if not href or _is_external_href(href):
                    continue
                target, _ = _resolve_local_path(html_path, href, self.out_dir)
                if not target or not target.exists():
                    self.add_finding(
                        severity="BLOCKER",
                        type_="BROKEN_ASSET_REF",
                        title="Local asset reference is missing",
                        evidence={
                            "from": str(html_path),
                            "href": href,
                            "resolved": str(target) if target else None,
                        },
                        suggested_next_step="Ensure assets are copied to output and referenced with correct relative paths.",
                    )

    def check_content_assignment(self) -> None:
        counts = Counter(item.get("experience", "") for item in self.content_items)
        generated_keys = {exp["key"] for exp in self._generated_experiences()}
        missing = [key for key in generated_keys if counts.get(key, 0) == 0]
        if len(counts) <= 1 or missing:
            self.add_finding(
                severity="MAJOR",
                type_="CONTENT_ASSIGNMENT_SUSPECT",
                title="Content items are not distributed across experiences",
                evidence={
                    "counts": counts,
                    "missingGeneratedExperiences": missing,
                },
                suggested_next_step="Confirm intended experience assignment per content item; add items for missing experiences or adjust routing.",
            )

    def summarize(self) -> dict:
        summary = {level: 0 for level in SEVERITY_ORDER}
        for finding in self.findings:
            if finding.severity in summary:
                summary[finding.severity] += 1
        return summary

    def top_findings(self, limit: int = 10) -> list[Finding]:
        prioritized = [
            f for f in self.findings if f.severity in ("BLOCKER", "MAJOR")
        ]
        return sorted(
            prioritized, key=lambda f: (SEVERITY_ORDER.index(f.severity), f.id)
        )[:limit]

    def print_top_findings(self, limit: int = 10) -> None:
        prioritized = self.top_findings(limit)
        if not prioritized:
            print("Top BLOCKER/MAJOR findings: none")
            return
        print("Top BLOCKER/MAJOR findings:")
        for f in prioritized:
            print(f"- [{f.severity}] #{f.id}: {f.title}")

    def write_reports(self) -> tuple[Path, Path]:
        _ensure_dir(self.report_dir)
        summary = self.summarize()
        payload = {
            "meta": self.meta,
            "summary": summary,
            "findings": [
                {
                    "id": f.id,
                    "severity": f.severity,
                    "type": f.type,
                    "title": f.title,
                    "evidence": f.evidence,
                    "suggested_next_step": f.suggested_next_step,
                }
                for f in self.findings
            ],
        }
        json_path = self.report_dir / "site_audit.json"
        json_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        md_lines = [
            "# Site Audit Report",
            "",
            "## Overview",
            "",
            f"- Executed: {self.meta.get('executedAt')}",
            f"- Out dir: {self.meta.get('outDir')}",
            f"- Command: `{self.meta.get('command')}`",
            f"- Parser: {self.meta.get('parser')}",
            "",
            "## Summary",
            "",
            "| Severity | Count |",
            "| --- | ---: |",
        ]
        for level in SEVERITY_ORDER:
            md_lines.append(f"| {level} | {summary.get(level, 0)} |")
        md_lines.extend(
            [
                "",
                "## Findings (sorted by severity)",
                "",
            ]
        )
        sorted_findings = sorted(
            self.findings, key=lambda f: (SEVERITY_ORDER.index(f.severity), f.id)
        )
        for f in sorted_findings:
            md_lines.append(f"### [{f.severity}] {f.title}")
            md_lines.append("")
            md_lines.append(f"- Type: `{f.type}`")
            md_lines.append(f"- ID: {f.id}")
            md_lines.append(f"- Evidence: `{json.dumps(f.evidence, ensure_ascii=False)}`")
            if f.suggested_next_step:
                md_lines.append(f"- Suggested: {f.suggested_next_step}")
            md_lines.append("")

        md_path = self.report_dir / "site_audit.md"
        md_path.write_text("\n".join(md_lines), encoding="utf-8")
        return json_path, md_path

    def run(self, command: str) -> tuple[Path, Path]:
        self.collect_meta(command)
        self.load_inputs()
        self.check_generated_outputs()
        self.check_routes()
        self.check_content_assignment()
        self.crawl_links()
        self.check_switcher()
        self.check_template_similarity()
        self.check_missing_sections()
        self.check_assets()
        self.check_branding()
        json_path, md_path = self.write_reports()
        self.print_top_findings()
        return json_path, md_path


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit generated site output.")
    parser.add_argument(
        "--out",
        required=True,
        help="Output directory produced by sitegen build.",
    )
    parser.add_argument(
        "--routes",
        help="Path to routes.json (defaults to <out>/routes.json if present).",
    )
    parser.add_argument(
        "--experiences",
        help="Path to experiences.yaml (optional but recommended).",
    )
    parser.add_argument(
        "--content",
        default="content/posts",
        help="Directory containing content JSON files.",
    )
    parser.add_argument(
        "--report-dir",
        default="reports",
        help="Directory to write audit reports.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    out_dir = Path(args.out).resolve()
    report_dir = Path(args.report_dir)
    routes_path = Path(args.routes).resolve() if args.routes else out_dir / "routes.json"
    experiences_path = Path(args.experiences).resolve() if args.experiences else None
    content_dir = Path(args.content)

    auditor = Auditor(
        out_dir=out_dir,
        routes_path=routes_path,
        experiences_path=experiences_path,
        content_dir=content_dir,
        report_dir=report_dir,
    )
    json_path, md_path = auditor.run(
        command="python scripts/audit_generated_site.py "
        f"--out {args.out} "
        f"--routes {routes_path} "
        + (f"--experiences {args.experiences} " if args.experiences else "")
        + (f"--content {args.content} " if args.content else "")
    )
    print(f"Wrote reports to {md_path} and {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
