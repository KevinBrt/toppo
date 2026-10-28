# Security policy

## Reporting a vulnerability

**Please do not report security issues in public issues, discussions or pull requests.**

Report them privately through GitHub: [Report a vulnerability](https://github.com/KevinBrt/toppo/security/advisories/new).

Include what you can: affected version or commit, steps to reproduce, impact, and a proof of concept if you have one.

What to expect:

- an acknowledgement within 3 working days;
- an assessment and a fix plan within 10 working days;
- a coordinated release: the fix ships first, then the advisory is published with credit to you (unless you prefer otherwise).

## Supported versions

Only the latest release receives security fixes. Run a pinned version and upgrade when an advisory is published.

## Scope

In scope: the Toppo server, web app, Docker image and official plugins in this repository, and the installation, reverse proxy and backup instructions of its documentation.

Out of scope: vulnerabilities in your own infrastructure (reverse proxy, TLS, host), third-party plugins, and findings that require an already compromised admin account or host.

## How Toppo is hardened

See the Security section of [ARCHITECTURE.md](ARCHITECTURE.md#security): strict CSP, route contracts enforced at boot, validated inputs and outputs, distroless non-root image, pinned and audited dependencies.
