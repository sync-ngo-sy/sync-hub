from __future__ import annotations

from functools import cache
from importlib.resources import files
from string import Formatter
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from yaml import YAMLError


class PromptConfigurationError(RuntimeError):
    pass


class PromptTemplate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    version: Literal[1]
    template: str = Field(min_length=1)
    input_variables: list[str]

    @model_validator(mode="after")
    def validate_variables(self) -> PromptTemplate:
        if len(self.input_variables) != len(set(self.input_variables)):
            raise ValueError("prompt input variables must be unique")
        placeholders = {name for _text, name, _format_spec, _conversion in Formatter().parse(self.template) if name}
        if placeholders != set(self.input_variables):
            raise ValueError("prompt placeholders do not match input variables")
        return self

    def render(self, **values: str) -> str:
        if set(values) != set(self.input_variables):
            raise PromptConfigurationError("prompt values do not match input variables")
        return self.template.format(**values)


_PROMPT_FILES = {
    "candidate_system": ("cv_intelligence_worker.candidate_extraction.prompts", "candidate_system.yaml"),
    "job_family_system": ("cv_intelligence_worker.candidate_extraction.prompts", "job_family_system.yaml"),
    "realtime_candidate_rules": ("cv_intelligence_worker.candidate_extraction.prompts", "realtime_candidate_rules.yaml"),
    "draft_validation": (__package__, "draft_validation.yaml"),
    "skill_classification": (__package__, "skill_classification.yaml"),
}


@cache
def load_prompt_template(name: str) -> PromptTemplate:
    resource = _PROMPT_FILES.get(name)
    if resource is None:
        raise PromptConfigurationError(f"unknown prompt template: {name}")
    package, filename = resource
    try:
        value: Any = yaml.safe_load(files(package).joinpath(filename).read_text(encoding="utf-8"))
        return PromptTemplate.model_validate(value)
    except (OSError, YAMLError, ValidationError) as exc:
        raise PromptConfigurationError(f"invalid prompt template: {name}") from exc
