# No-cost sentiment options

| Option | License/access evidence | Evaluation and decision |
| --- | --- | --- |
| Original Atlas small lexicon | Newly written original rule set, no external corpus or weights | Adopt only as an explicitly labeled heuristic. Tested on attribution, duplicated/stale/corrupted news, negation and contradictory terms. Accuracy and predictive confidence remain null. |
| VADER | Author repository states MIT and describes a lexicon/rule system aimed at social-media language | Compatible candidate for later isolated English finance-language validation. Not installed or integrated. General-domain scores would not establish financial event meaning or returns. |
| ProsusAI FinBERT | Pinned code license is Apache-2.0; README excludes pretrained weights and Financial PhraseBank from that grant | Defer weights/data until separate rights, offline compute and domain-validation evidence are established. No weights or dataset downloaded. |

VADER author sources:
<https://github.com/cjhutto/vaderSentiment> and
<https://github.com/cjhutto/vaderSentiment/blob/master/README.rst>.
The attempted Mac metadata/license retrieval timed out before a cache was
created; no VADER runtime or benchmark result is claimed.

FinBERT revision, README and license evidence are in upstream-evidence.json.
The ten-framework review and this optional sentiment comparison are distinct.

None of these options supplies six independent AI models. Atlas keeps six
deterministic roles and zero connected independent AI models. Sentiment never
overrides invalid data, stale signals, excess exposure or a deterministic risk veto.
