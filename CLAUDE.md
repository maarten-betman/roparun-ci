# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository is a fresh scaffold. As of this writing it contains only `README.md`, `LICENSE` (MIT), and a `.gitignore`. There is no source code, build system, test suite, or dependency manifest yet. Any "how to build / test / lint" guidance would be invented — do not assume one exists until a manifest (e.g. `pyproject.toml`, `requirements.txt`, `uv.lock`) appears.

## Project intent

Per `README.md`: "Repo for roparun route planning, visualization and tracking". The `.gitignore` is the standard GitHub Python template (covers pytest, mypy, ruff, uv, poetry, pdm, pixi, pipenv, marimo, Jupyter, Django, Flask, Scrapy, Sphinx, etc.), which strongly implies this will be a **Python** project. No specific tool within that list has been committed to yet — choose based on what the first contributor introduces, not on the gitignore entries.

## Working in this repo

- When adding the first real code, also add the corresponding tooling config (e.g. `pyproject.toml` with pinned dependencies and a test runner) and then update this file with the actual `build`, `test`, `lint`, and `run single test` commands. Do not add those sections to CLAUDE.md speculatively.
- Default branch is `master`.
- License is MIT — keep new files compatible.
