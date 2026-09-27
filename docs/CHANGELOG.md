# Changelog

## [v0.2.0](https://github.com/lukstei/curtain/compare/v0.1.3...v0.2.0)

### Features
- Invoke skills directly via natural slash or dollar commands (`/<skill>` or `$<skill>`) instead of manual `/curtain` commands
- Separate skills into public `SKILL.md` manifests and backstage `PLAYBOOK.md` instructions
- Add `/curtain-adopt` and `/curtain-eject` playbooks to convert existing skills to multi-act playbooks and back
- Switch build target to ESM bundle (`dist/curtain.mjs`)

### Bug Fixes
- Allow file-reading tools to inspect unrelated markdown playbooks without triggering execution
- Log unexpected filesystem and parsing errors when debug mode is active

## [v0.1.3](https://github.com/lukstei/curtain/compare/v0.1.2...v0.1.3)

### Features
- Replace `/curtain raise` with `/next`
- Switch delimiters to callout syntax
- Add codeblock and blockquote parsing

## [v0.1.2](https://github.com/lukstei/curtain/releases/tag/v0.1.2)

### Features
- Prepare release pipeline

## [v0.1.1](https://github.com/lukstei/curtain/releases/tag/v0.1.1)

### Features
- Prepare release pipeline

## [v0.1.0](https://github.com/lukstei/curtain/releases/tag/v0.1.0)

### Features
- Initial release
