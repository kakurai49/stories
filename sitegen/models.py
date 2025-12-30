"""Pydantic models for site generation."""

from typing import Annotated, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class Metric(BaseModel):
    """Represents a measurable outcome for an experiment."""

    name: str = Field(..., description="Short identifier for the metric.")
    description: Optional[str] = Field(
        None, description="What the metric means and why it matters."
    )
    target: Optional[str] = Field(
        None, description="Goal or direction for the metric (e.g., higher is better)."
    )


class EventSpec(BaseModel):
    """Defines an analytics event required for the experiment."""

    name: str = Field(..., description="Event name as emitted to analytics.")
    when: Optional[str] = Field(None, description="Trigger or scenario for the event.")
    properties: List[str] = Field(
        default_factory=list,
        description="Event properties that must be recorded with the event.",
    )


class TemplateExperiment(BaseModel):
    """Experiment design for a specific template variant."""

    key: str = Field(..., description="Short handle for the template.")
    template_name: str = Field(..., description="Display name of the template.")
    summary: Optional[str] = Field(
        None, description="Short description of the experiment intent."
    )
    metrics: List[Metric] = Field(
        default_factory=list, description="Metrics to monitor during the experiment."
    )
    events: List[EventSpec] = Field(
        default_factory=list, description="Events required for measurement."
    )


class ExperimentPlan(BaseModel):
    """Top-level experiment plan covering multiple templates."""

    name: str = Field(..., description="Overall name of the experiment plan.")
    description: Optional[str] = Field(
        None, description="High-level context about the plan."
    )
    templates: List[TemplateExperiment] = Field(
        default_factory=list, description="Templates included in the plan."
    )


class IASection(BaseModel):
    """Node in an information architecture outline."""

    title: str = Field(..., description="Heading or slot name.")
    summary: Optional[str] = Field(
        None, description="Short description of what appears in the section."
    )
    children: List["IASection"] = Field(
        default_factory=list, description="Nested sections under the heading."
    )


class IATemplateSpec(BaseModel):
    """Information architecture for a template family."""

    key: str = Field(..., description="Identifier for the template style.")
    name: str = Field(..., description="Human readable template name.")
    description: Optional[str] = Field(
        None, description="Short description of the layout intent."
    )
    sections: List[IASection] = Field(
        default_factory=list, description="Hierarchy of headings for the template."
    )


class IAPlan(BaseModel):
    """Collection of information architecture templates."""

    templates: List[IATemplateSpec] = Field(
        default_factory=list, description="Templates captured in the plan."
    )


class SiteConfig(BaseModel):
    """Placeholder for site configuration."""

    model_config = ConfigDict(arbitrary_types_allowed=True)


class Supports(BaseModel):
    """Capabilities an experience can work with."""

    page_types: List[str] = Field(
        default_factory=list,
        alias="pageTypes",
        description="Page types allowed for the experience (e.g., post, landing).",
    )
    features: List[str] = Field(
        default_factory=list,
        description=(
            "Feature flags or capabilities supported by the experience "
            "(e.g., comments, reactions)."
        ),
    )
    render_kinds: List[str] = Field(
        default_factory=list,
        alias="renderKinds",
        description="Allowed render contract kinds (e.g., markdown, html, external).",
    )
    locales: List[str] = Field(
        default_factory=list,
        description="Locales the experience supports, for hreflang or routing logic.",
    )

    model_config = ConfigDict(populate_by_name=True)


class RoutePatterns(BaseModel):
    """Patterns for deriving hrefs for an experience."""

    home: str = Field(
        ..., description="Route for the experience home page (no slug)."
    )
    list: str = Field(
        ..., description="Route for listing views that show multiple content items."
    )
    detail: str = Field(
        ..., description="Route pattern for individual content pages with {slug}."
    )

    model_config = ConfigDict(populate_by_name=True)


class ExperienceSpec(BaseModel):
    """Entry in experiences.yaml."""

    key: str = Field(..., description="Identifier for the experience (slug-friendly).")
    name: str = Field(..., description="Human readable name.")
    kind: Literal["legacy", "generated"] = Field(
        "legacy", description="Whether the experience is legacy or generated."
    )
    home: Optional[str] = Field(
        default=None,
        description="Optional home href for legacy experiences.",
    )
    content: dict[str, str] = Field(
        default_factory=dict,
        description="Optional map of contentId to href for legacy experiences.",
    )
    description: Optional[str] = Field(
        None, description="Short description of the experience goal."
    )
    output_dir: Optional[str] = Field(
        default=None,
        alias="output_dir",
        description="Output directory name for generated experiences, if applicable.",
    )
    supports: Supports = Field(
        default_factory=Supports,
        description="Feature matrix such as page types or locales.",
    )
    route_patterns: RoutePatterns = Field(
        ..., alias="routePatterns", description="Patterns used to generate routes.json."
    )

    model_config = ConfigDict(populate_by_name=True)


class MarkdownRender(BaseModel):
    """Content rendered from markdown."""

    kind: Literal["markdown"] = "markdown"
    markdown: str = Field(..., description="Markdown source text.")


class HtmlRender(BaseModel):
    """Content rendered from inline HTML."""

    kind: Literal["html"] = "html"
    html: str = Field(..., description="Trusted HTML fragment or document.")


class ExternalRender(BaseModel):
    """Content rendered by redirecting to an external target."""

    kind: Literal["external"] = "external"
    url: HttpUrl = Field(..., description="External URL to render or embed.")
    caption: Optional[str] = Field(
        None, description="Optional label describing the external target."
    )


RenderContract = Annotated[
    Union[MarkdownRender, HtmlRender, ExternalRender],
    Field(discriminator="kind"),
]


class ContentItem(BaseModel):
    """Schema for content/posts/*.json files."""

    content_id: str = Field(..., alias="contentId", description="Stable content id.")
    experience: str = Field(..., description="Experience key this content belongs to.")
    page_type: str = Field(..., alias="pageType", description="Page type for routing.")
    title: str = Field(..., description="Display title.")
    summary: Optional[str] = Field(None, description="Short teaser or deck.")
    excerpt: Optional[str] = Field(
        None,
        description="Optional short teaser used when summary is absent.",
    )
    date: Optional[str] = Field(
        None, description="Published date in ISO format or human friendly string."
    )
    body_html: Optional[str] = Field(
        None,
        alias="bodyHtml",
        description="Rendered HTML body for list or detail views.",
    )
    render: RenderContract = Field(..., description="How the content should render.")
    data_href: Optional[str] = Field(
        None,
        alias="dataHref",
        description="Optional href used when producing route data JSON.",
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Free-form tags for grouping or navigation.",
    )

    model_config = ConfigDict(populate_by_name=True)


class Route(BaseModel):
    """Entry inside routes.json."""

    href: str = Field(..., description="Public URL for the route.")
    content_id: str = Field(..., alias="contentId", description="Associated content.")
    page_type: str = Field(..., alias="pageType", description="Page template key.")
    data_href: Optional[str] = Field(
        None,
        alias="dataHref",
        description="Location of the JSON payload fetched via data-routes-href.",
    )

    model_config = ConfigDict(populate_by_name=True)


class RouteMap(BaseModel):
    """Schema for routes.json."""

    experience: str = Field(..., description="Experience key that owns the routes.")
    version: str = Field(
        "1.0",
        description="Schema version for the route map.",
    )
    generated_at: Optional[str] = Field(
        None, alias="generatedAt", description="ISO timestamp of when the map was built."
    )
    routes: List[Route] = Field(
        default_factory=list, description="Collection of available routes."
    )

    model_config = ConfigDict(populate_by_name=True)


__all__ = [
    "ContentItem",
    "EventSpec",
    "ExperimentPlan",
    "ExperienceSpec",
    "IAPlan",
    "IASection",
    "IATemplateSpec",
    "HtmlRender",
    "Metric",
    "RenderContract",
    "Route",
    "RouteMap",
    "RoutePatterns",
    "SiteConfig",
    "Supports",
    "TemplateExperiment",
    "MarkdownRender",
    "ExternalRender",
]
