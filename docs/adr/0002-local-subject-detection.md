# 0002: Local subject detection with ISNet + YuNet

- Status: accepted
- Date: 2026-10-19

## Context

v1 must work fully offline in one container (REQUIREMENTS §6.2). Sharp's `attention` heuristic alone is weak on illustrations and anime.

## Decision

`LocalSubjectDetector` (apps/server/src/detection) runs on a ≤1280 px working copy:

1. **ISNet** (`isnet-general-use`, 1024² input, rembg-compatible normalization) produces a saliency map. It is pooled to 256², thresholded at 0.5, and split into connected components; components with at least 25% of the dominant component's mass are kept. The output is a bounding box, a mass-weighted centroid, and a confidence (mean saliency, penalized for >60% coverage and for fragmentation).
2. **YuNet** (640² letterboxed BGR) finds faces (score ≥ 0.7, NMS 0.3). Faces are expanded 1.6× and always included in the subject box, and they pull the focal point (60% weight).
3. Fallbacks: sharp `attention` (two single-axis passes), then the image center.

Models are listed in `models/manifest.json` with SHA-256 checksums. They are fetched at image build time and loaded at startup. If one is missing, detection degrades gracefully and `/api/health` reports it.

## Consequences

- About 2.3 s per image on CPU, and about 170 MB added to the image.
- The ISNet weights have no explicit upstream license. Confirm redistribution terms before publishing the image publicly, or switch to downloading the weights at first start.
- Other detectors (cloud vision, BiRefNet, U²-Netp) can be swapped in behind the `SubjectDetector` interface.
