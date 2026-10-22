# 原版 / 当前版：统一评测结果

更新时间：2026-10-22T09:20:18.712598+00:00。

原始 1,200 题 / 2,400 份回答不重跑、不覆盖。所有新裁判均为 GPT-6.1 Sol。
采用原 Bench 指标/提示框架；裁判型号、运行输入等有适配，不是历史官方裁判的精确复现。

## 进度

| 阶段 | 已完成 | 计划 | 状态 |
|---|---:|---:|---|
| RGB / CRAG / MTRAG gates | 1296 | 1296 | complete |
| MTRAG RB / faithfulness | 963 | 963 | complete |
| MTRAG algorithmic | 464 | 464 | complete |

## 新裁判指标

待评项不显示部分样本分数充当全量；分母固定，不删除错误或格式失败。

| Benchmark / 子项 | 指标 | 每版 n | 原版 | 当前版 |
|---|---|---:|---:|---:|
| CRAG / ALL | accuracy | 120 | 19.17 | 16.67 |
| CRAG / ALL | missing | 120 | 0.00 | 0.00 |
| CRAG / ALL | hallucination | 120 | 80.83 | 83.33 |
| CRAG / ALL | score | 120 | -0.6167 | -0.6667 |
| MTRAG-UN / ALL | RB_llm_conditioned | 360 | 49.36 | 56.36 |
| MTRAG-UN / ALL | RB_alg_conditioned | 360 | 33.55 | 38.82 |
| MTRAG-UN / ALL | RL_F_conditioned | 360 | 56.56 | 66.62 |
| RGB / counterfactual | ED_star | 89 | 17.98 | 12.36 |
| RGB / counterfactual | CR_star | 89 | 25.00 | 45.45 |
| RGB / rejection | Rej_star | 91 | 94.51 | 94.51 |

比例和连续 [0,1] 分数按 0–100 显示；CRAG score 保持 [-1,1]。RB/faithfulness 不是答对题数。
MTRAG 主表是当前选定任务的样本加权均值，四领域等权宏均值另存，不混称同一口径。

## 已完成的确定性指标

| Benchmark / 子项 | 指标 | 每版 n | 原版 | 当前版 |
|---|---|---:|---:|---:|
| RGB / noise | answer_groups_accuracy | 91 | 84.62 | 86.81 |
| RGB / integration | answer_groups_accuracy | 89 | 29.21 | 32.58 |
| RGB / counterfactual | answer_groups_accuracy | 89 | 13.48 | 14.61 |
| HotpotQA / ALL | Answer_em | 120 | 1.67 | 0.83 |
| HotpotQA / ALL | Answer_f1 | 120 | 12.69 | 11.64 |

## 不能从旧记录补造的项目

- Hotpot SP/Joint：没有模型预测的官方支持事实；保持未采集。
- FreshStack 官方检索指标：旧实验是候选池 QA，缺全库 top-50；不将文字答案分冒充检索指标。
- MTRAG 官方全库检索：旧候选池输入不等于全库检索；本页为生成评分。
- RAGAS 未产生陈述时原算法返回未定义，不能静默记作 0；明细保留这一状态。
- MTRAG 的领域分项与四领域宏均值保存在 judged-report.json，全部保留完成数和分母。

各 Bench 不混算“总体正确率”；主分数和旧助手通过率不混用。

明细：judged-scores.jsonl；机器报告：judged-report.json；原始裁判输入/输出：各 substitute-judge* 子目录。
