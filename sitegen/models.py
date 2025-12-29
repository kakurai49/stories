"""Pydantic models for site generation."""

from pydantic import BaseModel


class SiteConfig(BaseModel):
    """Placeholder for site configuration."""

    class Config:
        arbitrary_types_allowed = True


__all__ = ["SiteConfig"]
