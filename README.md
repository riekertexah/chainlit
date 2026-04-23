# Chainlit (fork)

This is a fork of the [Chainlit](https://github.com/Chainlit/chainlit) open-source conversational AI framework, modified to support building and distributing universal Python wheels.

See [`backend/README.md`](backend/README.md) for full upstream documentation.

## My Changes

The upstream Chainlit does not publish a universal wheel that can be installed cross-platform from a local file. This fork adds:

- **Universal wheel build script** (`build_universal_wheel.sh`) — builds a platform-independent `.whl` that can be bundled directly into a project repo
- **Updated GitHub Actions workflow** — CI step that runs the universal wheel build and produces an artifact, replacing the standard platform-specific wheel build

The resulting `.whl` files are used in [litchain](https://github.com/riekert7/litchain/tree/develop) to pin a specific Chainlit version without requiring a PyPI release.