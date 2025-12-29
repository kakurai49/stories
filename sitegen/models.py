"""Pydantic models for site generation."""

from typing import List, Optional

from pydantic import BaseModel, Field


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


class SiteConfig(BaseModel):
    """Placeholder for site configuration."""

    class Config:
        arbitrary_types_allowed = True


__all__ = [
    "EventSpec",
    "ExperimentPlan",
    "Metric",
    "SiteConfig",
    "TemplateExperiment",
]
