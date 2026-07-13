# 005 — AGPL-3.0 License v1.0.0

## Status
Accepted

## Context

BYO20 is open-source. The license choice determines what others can do with the code — specifically, whether someone can take BYO20, run it as a hosted service, and not publish their modifications.

The SaaS loophole is the key concern: GPL requires source disclosure when you distribute software, but running software as a service over a network is not "distribution" under GPL's terms. A company could take BYO20, run a closed "AI DM as a service" offering, and never publish their changes.

## Decision

AGPL-3.0 for the main BYO20 repository. MIT for any utility packages extracted from the repo that have value independently of BYO20 (e.g. standalone D&D rules libraries).

AGPL-3.0 closes the SaaS loophole: if you run a modified version of BYO20 as a network-accessible service, you must publish your changes under AGPL-3.0. Self-hosters who don't distribute or offer a service have no obligations beyond normal GPL terms.

## Alternatives Considered

**MIT** — Rejected because it offers no protection against the SaaS loophole. Anyone can take the code, run a service, and keep all modifications proprietary.

**GPL-3.0** — Same copyleft protection as AGPL for binary distribution, but does not close the SaaS loophole. Running a modified BYO20 as a hosted service would not trigger GPL's disclosure requirement.

**SSPL (Server Side Public License)** — Stronger than AGPL but not OSI-approved. Rejected to keep BYO20 unambiguously open-source.

## Consequences

- Anyone can self-host BYO20 freely under AGPL-3.0.
- Anyone running BYO20 (or a fork) as a network service must publish their modifications under AGPL-3.0.
- Extracted utility packages can be MIT, making them freely usable without AGPL obligations — avoiding forcing AGPL on downstream users who just want, say, a D&D rules library.
- Contributors must agree that their contributions are AGPL-3.0 licensed.
