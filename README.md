# Spatial Notes experiment archive

This repository publishes a frozen static snapshot of the research document and experiment viewer to GitHub Pages. It does not run a model or a simulator, and requires no Python service or API credentials.

## Pages

- `site/index.html`: 当前文档
- `site/experiments.html`: 实验记录, including the four saved experiment variants
- `site/reasons.html`: the separately generated Chinese step-record reader
- `site/rag/index.html`: RAG original/current comparison, 1,200 paired tasks and
  2,400 saved answers, including the earliest experiments.

The RAG archive is published under `/spatial-notes-experiments/rag/`. It contains
the verified static snapshot only: no API key, account configuration, simulator,
Python server, or Sites private-hosting metadata. Model inputs/outputs and judge
records are read on demand. Forty earliest reused current-version answers have
no saved complete input; these are marked missing rather than reconstructed.
The other 2,360 model inputs were fingerprint-verified before export. FreshStack
official retrieval metrics, HotpotQA SP/Joint, and MTRAG full-corpus retrieval
metrics remain explicitly uncollected. Continuous scores are not converted into
an invented binary accuracy. Run `node verify-rag.cjs` to verify this addition.

The ESI document/viewer navigation opens RAG in a separate tab to keep the ESI
canvas and playback state intact. Original ESI data, scores and images are not
changed by the RAG addition.

The snapshot contains 93 runs, 1179 trajectory records, 128 robot replay frames and 259 Harness input steps. One newly recorded action has no RGB because of a GPU failure; it stays explicitly empty rather than being fabricated. The latest nine tasks contribute 97 engine actions and 107 records, with 106 original RGB frames. Every WebP conversion is lossless and its decoded RGBA pixels are checked against the original PNG. A size-budget repack may replace published PNG encodings; original experiment PNGs remain untouched and recoverable, as do prior Git snapshots. Saved geometry, model inputs and outputs are retained. The standalone Chinese reader still covers its original 49 records; it is not an expanded 93-record reader. New direct-observation summaries are in the main viewer.

The direct-observation column covers 44 tasks: the original 20 and 24 additional UI-only tasks from Category Ambiguity, Counting w Occlusion and Spatial Segmentation (eight additional questions per type). Each additional question uses a separate GPT-6.1 Sol Agent with no parent conversation inherited. The latest nine were completed in the background in-app browser; no manual browser opening or model API was required. Each question is limited to 30 engine actions cumulatively across technical recovery attempts. Scoring follows the final submission and is never given as retry feedback. Latest-batch accuracy is 4/9 (44.4%); cumulative accuracy is 22/44 (50.0%). The original common cohort remains 7/9 (77.8%). The preceding 84 catalog objects and 35 reviewed rows are exactly preserved. New questions have no unhinted, hinted or Harness counterpart and show `-` there. Connectivity and Correspondence direct observations retain the user's answer-correctness-only review policy. Incorrect answers are not discarded.

Two latest-batch questions encountered GPU failures and resumed the same question with the same independent solver, not substitute questions or score-informed retries. One failed before any observation. The other failed after six actions; both attempts are shown, with a trajectory break at reload and an explicitly missing RGB action. A collector path-variable bug also overwrote one camera sidecar JSON during postprocessing. Its full-precision pose was recovered from the unchanged native action log and session; the unknown original capture-retry counter remains null. This is marked in the viewer and in the local recovery audit, not claimed as byte-identical raw sidecar preservation. Original RGB, action summaries, submissions and benchmark scores were not changed. Original question-reference captures and failure logs remain in the local raw archive. The earlier usage-limit interruption likewise retained its original model and attempt.

New run provenance identifies any batch-local dependency-loading override. The simulator, dependency wheels and private task manifests are not deployed or executed by this static website. No existing simulator environment package or system DLL was replaced for this continuation.

All website dependencies are under `site/`. Links and data/image paths are relative, allowing deployment under a GitHub project-site path. The export does not automatically synchronize with later local experiment changes.

## Verification and publishing

Run `node verify-site.cjs` to check the exported file hashes, recorded-data coverage, all recorded image routes, GitHub project-path resolution, file-size limits, and high-confidence credential patterns. This pattern scan is a precaution, not a guarantee that every type of sensitive content is absent.

In repository Settings → Pages, select **GitHub Actions**. Pushing `main`, or manually running the **Publish static experiment archive** workflow, verifies and publishes `site/`. The workflow uses the official GitHub Pages actions pinned to verified commit IDs.

The user authorized a public repository and public GitHub Pages website on 2026-10-11. Full saved experiment inputs/outputs and local source-path provenance included in the snapshot are archive content. Do not add API credentials, unrelated personal files, or simulator installations.

`.gitattributes` disables newline conversion to keep the original snapshot bytes and recorded file hashes identical on Windows and GitHub Actions Linux runners.

The original static export and its ZIP remain separately preserved on the local machine.
