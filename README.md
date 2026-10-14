# Spatial Notes experiment archive

This repository publishes a frozen static snapshot of the research document and experiment viewer to GitHub Pages. It does not run a model or a simulator, and requires no Python service or API credentials.

## Pages

- `site/index.html`: 当前文档
- `site/experiments.html`: 实验记录, including the four saved experiment variants
- `site/reasons.html`: the separately generated Chinese step-record reader

The snapshot contains 84 runs, 1072 trajectory frames, 128 robot replay frames, 259 Harness input steps, 1041 original PNG images and 144 additional lossless WebP images. Every new image's decoded RGBA pixels were checked against its original PNG. The existing image files and playback assets are unchanged. Saved observations, geometry, model inputs, and model outputs are retained. The standalone Chinese reader still covers its original 49 records; it is not an expanded 84-record reader.

The direct-observation column now covers 35 tasks: the original 20 and 15 new UI-only sessions from Category Ambiguity, Counting w Occlusion and Spatial Segmentation (five new questions per type). Every new question was assigned to a separate GPT-6.1 Sol Agent with no parent conversation inherited. New sessions use at most 30 engine actions; scoring is performed after submission and is never supplied as feedback for a retry. The original 69 catalog entries, all 20 existing reviewed rows and the nine-task common comparison cohort are preserved. Overall answer accuracy is 18/35 (51.4%); the original common cohort remains 7/9 (77.8%). New questions have no unhinted, hinted or Harness counterpart, and are displayed with `-` in those columns rather than included as failures. No direct-observation result is currently labeled suspected-correct; new process labels are based on saved action summaries, not a claim of proven exhaustive exploration. Per the user's updated review, direct-observation Connectivity and Correspondence submissions are labeled correct or incorrect solely by answer correctness; the other columns' labels are unchanged. Incorrect submissions and renderer anomalies are not removed. Raw experimental data and benchmark scores are unchanged. One new Agent resumed its original attempt after a usage-limit interruption without changing model or starting a new attempt.

New run provenance identifies any batch-local dependency-loading override. The simulator, dependency wheels and private task manifests are not deployed or executed by this static website. No existing simulator environment package or system DLL was replaced for this continuation.

All website dependencies are under `site/`. Links and data/image paths are relative, allowing deployment under a GitHub project-site path. The export does not automatically synchronize with later local experiment changes.

## Verification and publishing

Run `node verify-site.cjs` to check the exported file hashes, recorded-data coverage, all recorded image routes, GitHub project-path resolution, file-size limits, and high-confidence credential patterns. This pattern scan is a precaution, not a guarantee that every type of sensitive content is absent.

In repository Settings → Pages, select **GitHub Actions**. Pushing `main`, or manually running the **Publish static experiment archive** workflow, verifies and publishes `site/`. The workflow uses the official GitHub Pages actions pinned to verified commit IDs.

The user authorized a public repository and public GitHub Pages website on 2026-10-11. Full saved experiment inputs/outputs and local source-path provenance included in the snapshot are archive content. Do not add API credentials, unrelated personal files, or simulator installations.

`.gitattributes` disables newline conversion to keep the original snapshot bytes and recorded file hashes identical on Windows and GitHub Actions Linux runners.

The original static export and its ZIP remain separately preserved on the local machine.
