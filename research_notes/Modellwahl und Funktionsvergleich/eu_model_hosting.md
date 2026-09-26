# EU-compliant LLM hosting for a German children's learning app (as of 2026-09-26)

Evidence levels used in these notes:

- **[FULL]**: I read the full source page myself (WebFetch).
- **[SNIPPET]**: search-engine summary or snippet only. The page was not read in full, often because the site was blocked (see below). Treat as unverified.
- **[INFERENCE]**: my own reasoning.
- **[TRAINING]**: from model knowledge (cutoff June 2026). No 2026 source checked. Must be re-verified.

**Blocked sites.** The research proxy blocked these sites for full fetches: docs.cloud.google.com (and cloud.google.com/vertex-ai, which redirects there), learn.microsoft.com, mistral.ai, optinest.de and kevinwelter.com. The key Google, Microsoft and Mistral primary pages were therefore only seen as search snippets. **Before any decision, re-check them in a browser.** No GitHub mirrors of these pages were found in the time available.

**Suspicious snippets.** Several search summaries named model versions and prices (for example "Gemini 3.7 Flash", "GPT-5.5/5.6", "Mistral Medium 3.5", "Mistral Small 4") that I cannot confirm from a primary source. They are recorded as snippets, not as facts.

---

## 1. Google Vertex AI (now also branded "Gemini Enterprise Agent Platform"): Gemini 3.x in the EU, Claude and Mistral on Vertex

### Takeaway

According to Google's data-residency page (seen as a snippet only), the jurisdictional `eu` multi-region endpoint keeps both ML processing and data at rest inside EU member states. That fits the team's probe result: Gemini 3.x is served only via `eu`, not via europe-west4. For a children's app, the biggest open risk on Google is not residency. It is (a) abuse-monitoring prompt logging, which must be opted out of, (b) the 24 h default cache, and (c) whether Google's generative-AI terms restrict services "likely to be accessed by" people under 18. That restriction is confirmed only for Pre-GA/Preview products.

### Cited Findings

- **`eu` endpoint scope [SNIPPET]:** "When using jurisdictional endpoints … ML processing stays within that specific geographical region (such as the United States or the European Union)." The EU multi-region (`eu`) endpoint covers data residency within EU member states and excludes the UK and Switzerland. The default **global** endpoint gives "no regional isolation or data residency guarantee." — [Google Cloud, Data residency](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency). The page itself was blocked; content came via the search summary.
- **Data at rest and processing location [SNIPPET]:** "Data stored at rest in the customer selected location remains at rest in that location, independent of the endpoint called, and ML processing … occurs within the specific region or multi-region where the request is made." Customers must choose regional or jurisdictional endpoints for the ML-processing commitment to apply. — [Google Cloud, Data residency](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency)
- **Which Gemini models are covered [SNIPPET]:** Data residency at rest and ML processing in the `eu` multi-region are "documented, per the model pages (as of 18 September 2026), for Gemini 3.5 Flash, 3.6 Flash, 3.7 Flash, 3.8 Flash and 3.5 Flash-Lite." — search summary citing [Google Cloud, Data residency](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency) and [Deployments and endpoints](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations). This partly conflicts with the team's own probe, which found 3.1 Flash-Lite, 3.5, 3.6 and 3.8 Flash on `eu`. Neither source mentions 3.7 Flash or 3.5 Flash-Lite being covered by the probe, and Gemini 3.x **Pro** in `eu` is not mentioned at all.
- **Known client pitfall [SNIPPET]:** a gemini-cli issue reports that "Vertex AI with API key ignores GOOGLE_CLOUD_LOCATION and uses the global endpoint." Clients can therefore silently lose residency. — [GitHub issue #27984](https://github.com/google-gemini/gemini-cli/issues/27984)
- **Abuse-monitoring logging [SNIPPET]:** when safety classifiers flag activity, Google "may log customer prompts … stored securely for up to 90 days in the same region or multi-region selected by the customer." The data is not used for training. Customers can request an opt-out by form; if it is approved, prompts are not stored. Only customers under the GCP Terms of Service **without an invoiced billing account** are subject to prompt logging. — [Google Cloud, Abuse monitoring](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/abuse-monitoring)
- **Zero data retention [SNIPPET]:** to achieve ZDR, customers must disable data caching for Google models, because "cached contents are stored for up to 24 hours by default." ZDR may not be possible with some features (for example grounding). — [Google Cloud, Zero data retention](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention)
- **Prices on Vertex [SNIPPET, third-party aggregators, Sep 2026]:**
  - Gemini 3.5 Flash: $1.50 in / $9.00 out per 1M tokens — [CloudZero](https://www.cloudzero.com/blog/google-vertex-ai-pricing/)
  - Gemini 3.5 Flash-Lite: $0.30 / $2.50
  - Gemini 3.1 Flash-Lite: $0.25 / $1.50
  - Gemini 2.5 Flash-Lite: $0.10 / $0.40, said to be available "through October 16, 2026" (a retirement signal)
  - Sources for these: [CloudZero Gemini pricing](https://www.cloudzero.com/blog/gemini-pricing/), [BenchLM](https://benchlm.ai/google/api-pricing). The official pricing page is [Agent Platform Pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing), which was not fetched. Whether `eu` multi-region carries a surcharge over global was not verified.
- **Minors, Preview terms [SNIPPET]:** Google Cloud prohibits using **Generative AI Preview Products** "as part of a website, customer application, or other online service that is directed towards or is likely to be accessed by individuals under the age of 18." — [Supplementary Terms for GenAI Preview Products](https://cloud.google.com/terms/genai-preview-products)
- **Minors, GA terms [FULL, but inconclusive]:** I fetched the Service Specific Terms. The tool did not surface a generative-AI section with an under-18 clause. It showed only Section 5 (Pre-GA: no SLA, no data-processing terms) and a reference to "AI/ML Data Location" (Section 1.b). — [Google Cloud Service Specific Terms](https://cloud.google.com/terms/service-terms)
- **Gemini Developer API (AI Studio) minors [TRAINING]:** the Gemini API Additional Terms (ai.google.dev) have long contained a clause forbidding use in services "directed towards or likely to be accessed by individuals under the age of 18." This applies to the **AI Studio / Gemini Developer API, not Vertex**. It has not been verified for 2026.
- **Claude on Vertex EU [SNIPPET]:** secondary sources say Vertex and Bedrock "offer the strongest regional deployment flexibility, including European regions" for Claude. — [Sonomos](https://sonomos.ai/blog/claude-eu-data-residency-2026/), [Lingaro](https://lingarogroup.com/insights/claude-data-residency-and-compliance-explained). No primary list of which Claude versions run in which Vertex EU region (europe-west1, europe-west4, or the `eu` multi-region) was verified.
- **Mistral on Vertex:** no 2026 source found.

### Inferences

- **[INFERENCE]** For Gemini 3.x, `eu` is the correct endpoint. The processing guarantee is a contractual statement in Google's data-residency page (and in the "AI/ML Data Location" service terms). It holds only if the client really calls the `eu` jurisdictional host and never the global one. Code should hard-pin the host and fail closed on anything else, in line with CLAUDE.md rule 1 ("code enforces").
- **[INFERENCE]** Because LearnBuddy is a paying invoiced or enterprise account, request the abuse-logging opt-out (or check the invoiced-billing exemption). Disable context caching or accept its 24 h retention in the privacy docs (`docs/privacy.md`).
- **[INFERENCE]** Use only **GA** models. Preview Gemini models are both outside the DPA (per Section 5) and explicitly barred for services likely used by under-18s.

### Gaps

- The full text of Google's data-residency page, the per-model `eu` availability table, and whether Gemini 3.x Pro or Claude are available in `eu`. The page was blocked.
- Whether the GA Generative AI Service Terms (not Preview) contain an under-18 restriction for Vertex. Must be checked manually at cloud.google.com/terms/service-terms (the "Generative AI Services" section).
- The official Vertex price list, including any `eu` multi-region premium.

---

## 2. Anthropic API, and Claude on AWS Bedrock (Frankfurt / EU cross-region)

### Takeaway

Anthropic's first-party API had **no EU processing option** as of 2026 (`inference_geo` accepts only `global` and `us`, per secondary sources). EU processing for Claude is therefore realistic only via Bedrock EU (a regional or EU cross-region profile) or Vertex EU. Anthropic explicitly allows products used by minors, but with mandatory safeguards: age verification, moderation, monitoring, AI disclosure, and use of its child-safety system prompt.

### Cited Findings

- **Guidelines for organizations serving minors [FULL, dated 16 March 2026]:** organizations must implement:
  - "Age verification systems to ensure only intended users can access the product"
  - "Content moderation and filtering to block inappropriate or harmful content"
  - "Monitoring and reporting mechanisms"
  - "Educational resources and guidance for minors"
  - use of Anthropic's child-safety system prompt "when available"
  - compliance with laws such as COPPA
  - "Disclosure to their users that they are interacting with an AI system rather than a human"

  No fixed minimum age is stated, and there is no use-case restriction. Anthropic may audit, and may "suspend or terminate your account." The page does not say whether it applies via Bedrock or Vertex. — [Claude Help Center](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors)

- **Usage Policy [SNIPPET]:** the policy prohibits CSAM, grooming and sexualization of minors. A separate "Child safety guidance for developers" article exists. — [Claude Help Center, child safety guidance](https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers); [Anthropic Usage Policy](https://www.anthropic.com/policy)
- **No EU option on the Anthropic API [SNIPPET]:** "The inference_geo parameter of the Claude API accepts two values, 'global' and 'us', with no EU option." — [Sonomos](https://sonomos.ai/blog/claude-eu-data-residency-2026/), [GitHub claude-code #40526](https://github.com/anthropics/claude-code/issues/40526)
- **Claude on Microsoft Foundry [SNIPPET]:** Claude reached GA on Microsoft Foundry, but "European enterprises cannot deploy it" on EU infrastructure yet. Anthropic lists Foundry Europe as "Coming 2026." — [InfoQ, July 2026](https://www.infoq.com/news/2026/07/claude-foundry-ga-europe/), [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5867930/timeline-for-claude-in-microsoft-foundry-to-run-on)
- **Bedrock EU cross-region inference [SNIPPET]:**
  - The EU geo profile for Claude Sonnet 4.5 routes to eu-north-1, eu-west-3, eu-south-1, eu-south-2, eu-west-1 and eu-central-1. — [AWS Alps blog](https://aws.amazon.com/blogs/alps/unlocking-ai-flexibility-in-switzerland-a-guide-to-cross-region-inference-for-eu-data-processing-and-model-access)
  - Geo profiles come "at no additional charge," priced by the source region. — [AWS Alps blog](https://aws.amazon.com/blogs/alps/unlocking-ai-flexibility-in-switzerland-a-guide-to-cross-region-inference-for-eu-data-processing-and-model-access)
  - Note that **Global** cross-region profiles would leave the EU.
  - Newer Claude models in eu-central-1 are often available only via the EU cross-region profile, and quotas are a known issue. — [AWS re:Post](https://repost.aws/questions/QU1ZrfdLMMT5CvH6rzYkr1bA/claude-4-availability-in-eu-regions), [Requesty](https://www.requesty.ai/blog/claude-eu-data-residency-bedrock-quota-fallback-regions)
- **Bedrock data handling [TRAINING]:** AWS says Bedrock does not store or log prompts and completions and does not share them with model providers or use them for training. Abuse detection is automated, without human review of content by default. Not re-verified for 2026.
- **Claude prices [not verified]:** no current per-token Claude prices were verified in this session. Use the `claude-api` skill or [anthropic.com/pricing](https://www.anthropic.com/pricing) and the Bedrock pricing page.

### Inferences

- **[INFERENCE]** Claude is a strong candidate for "careful tutoring and explanations," but only through Bedrock with the **EU** profile (or eu-central-1 in-region). Anthropic's minors guidelines then add product obligations. LearnBuddy already has parental consent and moderation plans. "Age verification" would have to be met by the parent-consent flow.
- **[INFERENCE]** Bedrock routes across EU regions including eu-south (Italy/Spain) and eu-north. That is fine under GDPR (EU-only) but is not "Germany-only."

### Gaps

- An official list of Claude models (Sonnet, Haiku, Opus current versions) on Bedrock EU and on Vertex EU. Current Claude prices.
- Whether Anthropic's minors guidelines bind Bedrock and Vertex customers. They likely do via the pass-through usage policy **[INFERENCE]**, but this is unverified.

---

## 3. Azure OpenAI / Microsoft Foundry: EU Data Zone

### Takeaway

"Data Zone Standard (EU)" deployments keep inference within the EU data zone. A snippet claims a price about 10% above Global Standard, which conflicts with another snippet claiming no surcharge. OpenAI's under-18 API guidance allows serving minors with safeguards, and requires ZDR before processing personal data of children under 13 or under the age of digital consent. In Germany that age is 16, which is directly relevant to LearnBuddy.

### Cited Findings

- **Data Zone EU [SNIPPET]:** Data Zone Standard keeps processing inside a defined US, EU or APAC zone. For "Data Zone Standard (EUR)," processing including inference stays within the EU. — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5630048/azure-openai-deployments-difference-between-data-z), [Microsoft Foundry deployment types](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/deployment-types) (blocked, snippet only), [Azure blog, Data Zones launch](https://azure.microsoft.com/en-us/blog/announcing-the-availability-of-azure-openai-data-zones-and-latest-updates-from-azure-ai/)
- **Price [SNIPPET, conflicting]:**
  - "GPT-5.5 Global Standard is $5 input … $30 output per million tokens. The base Data Zone meter is $5.50/$33." — [BenchLM Azure](https://benchlm.ai/azure/llm-pricing)
  - Contradicted by: "A Data Zone deployment costs the same per-token price as Global Standard." — [Requesty](https://www.requesty.ai/eu/openai)
  - A third source mentions "GPT-5.6 price cuts." — [Technspire](https://technspire.com/en/blog/azure-openai-cost-check-autumn-2026-gpt-5-6)
  - None of these could be checked against Azure's own pricing page.
- **OpenAI under-18 API guidance [SNIPPET]:**
  - "You should not use OpenAI services to process any personal data of children under 13 or the applicable age of digital consent without first implementing zero data retention in our API."
  - Organizations serving minors must comply with child-protection laws, keep content age-appropriate, and "use OpenAI's most current flagship models."
  - OpenAI may audit.
  - End-user terms: 13+, or the local minimum age, with parental permission under 18.

  — [OpenAI, Under 18 API Guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance), [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/)

- **Azure abuse monitoring [TRAINING]:** Azure OpenAI stores prompts for up to 30 days for abuse monitoring unless the customer is approved for "modified abuse monitoring" via an application form. Not re-verified for 2026.

### Inferences

- **[INFERENCE]** Whether the OpenAI ZDR requirement for under-16s in Germany transfers to Azure OpenAI is unclear, since Microsoft is the contracting processor. Obtaining modified abuse monitoring from Microsoft would be the functional equivalent.
- **[INFERENCE]** Azure is attractive for GPT-class "mini/nano" cheap tiers, but the model names and prices seen (GPT-5.5/5.6) come only from aggregators.

### Gaps

- Official Azure pricing and the EU Data Zone model list (GPT-5.x mini/nano, GPT-4.1-mini) as of Sep 2026.
- The current status of modified abuse monitoring. learn.microsoft.com was blocked.

---

## 4. Mistral AI La Plateforme

### Takeaway

Mistral is an EU (French) company and avoids US-parent Schrems II exposure. Prices seen via aggregators are low. mistral.ai was blocked, so model names, prices, hosting location and minors terms are unverified.

### Cited Findings

- **Prices [SNIPPET, aggregators, "September 2026"; source conflict]:**
  - "Mistral Medium 3.5 costs $1.50/$7.50 per million input/output tokens." — [BenchLM Mistral](https://benchlm.ai/mistral/api-pricing)
  - "Mistral Small 4 costs $0.15/$0.60." — [BenchLM Mistral](https://benchlm.ai/mistral/api-pricing)
  - "Mistral Large costs $0.5 in / $1.5 out" — [CloudZero](https://www.cloudzero.com/blog/mistral-api-pricing/)
  - The search headline "Small $0.20/M, Large $2/M" contradicts the figures above. — [DevTk](https://devtk.ai/en/blog/mistral-api-pricing-guide-2026/)
  - The batch discount is 50%. — [CloudZero](https://www.cloudzero.com/blog/mistral-api-pricing/)
  - Official page: [mistral.ai/pricing](https://mistral.ai/pricing/) (blocked).
- **Hosting and terms [TRAINING]:** Mistral historically hosts La Plateforme in the EU (Sweden via Azure, plus own infrastructure). It offers a DPA and zero data retention on request. API data is not used for training on paid plans. Its models include Pixtral (vision), Magistral (reasoning) and a Mistral OCR API. Not re-verified.

### Gaps

- An official price list, current model generation, EU-only hosting statement, sub-processor list (possibly including US hyperscalers), any minimum age for end users of API customers, and the ZDR procedure.

---

## 5. EU sovereign hosters of open-weight models (IONOS, STACKIT, OVHcloud, Scaleway, Aleph Alpha)

### Takeaway

German hosters (IONOS, STACKIT) give full German/EU processing without a US parent. However, catalogs are small: Llama 3.x, Mistral Small/Nemo and gpt-oss appear. Model strength for handwriting OCR and maths is well below Gemini 3.x Flash or Claude **[INFERENCE]**.

### Cited Findings

- **IONOS [SNIPPET]:**
  - Llama 3.3 70B at €0.65/1M tokens for both in and out
  - Catalog of about six models: Llama 3.1/3.3, Mistral Nemo/Small, gpt-oss-120b
  - "no current GLM, DeepSeek, Qwen or Kimi models"

  — [DEV.to EU inference comparison 2026](https://dev.to/valeria_bernhardt_c9473b7/choosing-an-eu-hosted-inference-provider-a-2026-comparison-5d5h), [IONOS AI Model Hub](https://cloud.ionos.com/managed/ai-model-hub)

- **STACKIT (Schwarz Group, German data centres) [SNIPPET]:**
  - GPT-OSS 20B at $0.18/1M input tokens
  - About 5 models
  - Llama 3.3 70B described as price-competitive against OVHcloud

  — [serenitiesai STACKIT](https://serenitiesai.com/benchmark/providers/stackit), [european.cloud](https://european.cloud/2025/10/stackit-ai-model-serving/), [STACKIT product page](https://stackit.com/en/products/data-ai/stackit-ai-model-serving)

- **Scaleway (France) [SNIPPET]:** serverless Generative APIs billed per 1M tokens, plus dedicated hourly deployments. — [Scaleway Generative APIs](https://www.scaleway.com/en/generative-apis/), [Scaleway pricing](https://www.scaleway.com/en/pricing/model-as-a-service/). Model list and prices were not extracted.
- **OVHcloud AI Endpoints, Aleph Alpha:** no 2026 data found in this session.

### Inferences

- **[INFERENCE]** These hosters suit a "sovereign fallback" or cheap text-only tutor turns, for example gpt-oss-120b or Mistral Small. They are unlikely to match Gemini 3.x on handwritten worksheet photos. None of the snippets showed a strong vision model other than possibly Mistral Small (multimodal) on IONOS.

### Gaps

- Current catalogs and prices from the official pages, vision-model availability, latency figures, and each hoster's terms on minors. No source was found for any of these.

---

## 6. German DPA guidance (DSK, BfDI, state DPAs) on LLMs with children's / education data

### Takeaway

The DSK guidance "KI und Datenschutz" (6 May 2024) is the core document. It is a checklist for controllers selecting and using LLM applications, and was followed in June 2025 by DSK guidance on technical and organisational measures (TOMs) for AI systems. School-oriented summaries emphasise that prompts from pupils must never be used for training. No DSK document specific to children's consumer apps was found.

### Cited Findings

- **DSK guidance 2024 [SNIPPET]:** "Orientierungshilfe Künstliche Intelligenz und Datenschutz," focused on LLMs. It is a checklist for controllers covering purpose, transparency, data-subject rights, accuracy of outputs, and so on. — [DSK PDF 2024-05-06](https://www.datenschutzkonferenz-online.de/media/oh/20240506_DSK_Orientierungshilfe_KI_und_Datenschutz.pdf), [LDI NRW](https://www.ldi.nrw.de/dsk-orientierungshilfe-ki-fuer-unternehmen-und-behoerden), [Sachsen DSB](https://www.datenschutz.sachsen.de/kuenstliche-intelligenz-und-datenschutz-dsk-veroeffentlicht-orientierungshilfe-fuer-unternehmen-und-behoerden-7205.html)
- **DSK follow-up 2025 [SNIPPET]:** "Orientierungshilfe zu empfohlenen technischen und organisatorischen Maßnahmen bei der Entwicklung und beim Betrieb von KI-Systemen" (17 June 2025). — [DatenschutzArchiv PDF](https://datenschutzarchiv.org/detailansicht/Dokumente/2025/LL_DSK_20250617_de.pdf)
- **School context [SNIPPET, secondary]:** when pupils use AI platforms, the backend LLM must never use prompt data for training. — [Unterrichten Digital, 2025](https://unterrichten.digital/2025/05/09/ki-schule-datenschutz-dsgvo-ki-verordnung-eu-ai-act/)

### Inferences

- **[INFERENCE]** The provider checklist that follows from DSK practice: an Art. 28 DPA (AVV); no training on customer data; EU processing (or DPF plus SCCs for US parents); a sub-processor list; retention and logging switched off or minimised; and support for data-subject rights. Children's data raises the bar under Art. 8 and Recital 38 GDPR. A DPIA (Art. 35) is likely needed.
- **[INFERENCE]** Google, AWS and Microsoft are US parents. Even with EU processing, CLOUD Act access remains a residual risk. They rely on the EU-US Data Privacy Framework. The DPF status (still valid after the September 2025 EU General Court ruling in Latombe) was not re-verified here **[TRAINING]**.

### Gaps

- DPA statements specific to LLMs and minors in consumer apps (BfDI, LfDI BW, Bavaria) — none found.
- EDPB Opinion 28/2024 on AI models, and any 2026 DSK update — not fetched.

---

## Summary comparison (for the report writer)

| Option                    | EU processing                                  | Minors terms                                                     | Cheap tier (price/1M in/out)                           | Strong tier                                   | Evidence             |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------- | -------------------- |
| Vertex `eu` Gemini 3.x    | Yes, `eu` jurisdictional endpoint (not global) | Preview products barred for under-18; GA terms unverified        | 3.1 Flash-Lite $0.25/$1.50; 3.5 Flash-Lite $0.30/$2.50 | 3.5 Flash $1.50/$9.00; Pro in `eu` unknown    | Snippet              |
| Anthropic API             | No EU option (`global`/`us` only)              | Allowed with safeguards (full source, Mar 2026)                  | —                                                      | —                                             | Full + snippet       |
| Claude on Bedrock EU      | Yes, EU geo profile across 6 EU regions        | Anthropic guidelines likely apply                                | Not verified                                           | Not verified                                  | Snippet              |
| Azure OpenAI Data Zone EU | Yes, EU data zone                              | OpenAI: ZDR required for under-13 / under age of digital consent | Not verified                                           | GPT-5.5 $5/$30 (Data Zone possibly $5.50/$33) | Snippet, conflicting |
| Mistral La Plateforme     | EU company (hosting unverified)                | Unknown                                                          | Small 4 $0.15/$0.60 (conflicting)                      | Medium 3.5 $1.50/$7.50                        | Snippet              |
| IONOS / STACKIT           | Germany                                        | Unknown                                                          | gpt-oss-20B $0.18 in; Llama 3.3 70B €0.65              | gpt-oss-120b, Llama 3.3 70B                   | Snippet              |
