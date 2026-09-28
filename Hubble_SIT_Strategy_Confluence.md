# Hubble & Signal B SIT Strategy: Scope, Levels and Coverage Assessment

| | |
|---|---|
| **Status** | DRAFT for review |
| **Owner** | SIT Lead, Hubble |
| **Reviewers** | Test Manager, Hubble Product Owner, Platform (EKS) lead, DBA (Aurora), Service squad leads |
| **Last updated** | 28 Sep 2026 |
| **Related pages** | Hubble AWS – Dev · Hubble AWS – Migration Plan · Hubble Aurora Design (Hubble_Aurora_Design.xlsx) · Service Resource Limits · Hubble to Daytona Connectivity · AWS EKS Cluster access |

---

## 1. Purpose

This page defines how System Integration Testing (SIT) is scoped, structured, automated and gated for Hubble and Signal B on AWS (EKS + Aurora PostgreSQL + Enterprise Kafka AWS). It lists every feature SIT must prove, today's coverage, the gaps, and the plan to close them.

---

## 2. Summary

SIT for Hubble tests only **how the services work together**. Single-service rules stay in **SLFT**, run by the service squads, and a passing SLFT result is required before a build enters SIT.

SIT runs in the shared SIT environment with every Hubble service deployed on **EKS**, persisting to **Aurora PostgreSQL**, and connected to **Enterprise Kafka AWS**, S3, EMS, SFTP, Daytona and SignalB. Only third-party feeds are simulated. SIT checks that data flows correctly from ASX Trade, nCore, S&P, MorningStar, OIIP and DCS/DPS through processing and Aurora to the published products (D01, D04, D06, D33, E03, CS/BT), to the HUBDAM data archive, and on through Signal B to participants as FIX Trade Capture Reports (35=AE). It also checks that Hubble keeps working through normal platform events: pod restarts, node drains, rolling deploys, Aurora failover and blue/green cutover.

SIT is tested at three levels:

- **L1 Interface.** Every Kafka topic, EMS queue, S3/SFTP location, Aurora database, network path, certificate and identity is connected and correct. The EKS platform baseline is validated.
- **L2 Flow integration.** Data crosses service boundaries correctly and lands in the right Aurora tables. This covers start of day, reference data changes, date roll, stored-offset recovery, platform events and traceability.
- **L3 End-to-end business cycle.** Each product is correct, on schedule, delivered and reconciled with legacy Core, including multi-day corporate actions, SignalB delivery, parity with on-prem Hubble, and blue/green cutover.

Tests are automated in the existing Cucumber framework, and each test is tagged to its Jira story so coverage can be tracked in a traceability matrix. Five quality gates control progress: story ready, SIT entry, story integrated, nightly regression and SIT exit. Performance, AZ/region DR and HA timing follow SIT exit, handled by SPT and OAT.

**Current position.** Of the **72** required SIT features, **8 are covered, 24 partially covered and 40 not covered**. Signal B's FIX-facing behaviour is well covered, but it is fed with seeded data; the real Hubble → Signal B hand-off, recovery and full E2E run are not in CI. Coverage is strong for final reports but weak in the middle of the pipeline (Aurora persistence, start of day, TAS, recovery, file ingestion). There is no coverage yet of the AWS platform itself: the EKS baseline, Aurora roles and schema, network paths, certificates, Pod Identity and blue/green.

**Reuse.** EKS validation reuses the automated cluster validation already running for the Enterprise Kafka AWS project (73/73 checks passing). About 70% of its check types apply to Hubble as-is or through configuration, so the platform gate can be live in sprint 1 (section 8.1).

---

## 3. Scope

### 3.1 SLFT vs SIT boundary

| | SLFT (service squads, dev env) | SIT (shared SIT env on AWS) |
|---|---|---|
| Question | Does this service apply its rules correctly? | Do the real services, on the real platform, produce the right data and products together? |
| Environment | Dev or individual env; neighbours mocked | SIT EKS cluster + Aurora + Enterprise Kafka AWS; all Hubble services real; only third-party feeds simulated |
| Owns | Full rule matrices: TAS criteria, valuation/footnote rules, intrinsic value, QSE AC1–AC8, field derivation, single-service rejection | Hand-offs, schema compatibility, SOD sequence, reference-data propagation, date roll, stored-offset recovery, platform events, Aurora persistence, schedules, delivery, reconciliation, multi-day lifecycle, traceability |
| Rule coverage | Every branch of every rule | One representative case per rule family, through the real chain |
| Evidence | SLFT report per build, tagged @HUBES | Cucumber/ExtentReports, cluster validation report, generated RTM |

> **Deciding test.** If a test would pass with every neighbouring service mocked, it belongs in SLFT. SIT covers only what can fail when services, data, time and platform meet.

### 3.2 In scope

- All functional integration requirements (ingestion, processing, TAS, streaming, Aurora snapshots, outbound products, corporate actions)
- AWS platform integration: EKS workload baseline, Aurora connectivity/roles/schema, network paths, certificates/DNS, Pod Identity, S3
- Functional resilience: pod restart, node drain, rolling deploy, Aurora writer failover, DB unavailability, blue/green cutover (no loss, no duplicates)
- NFR-02 traceability (correlation ID across services to Elasticsearch)
- Migration parity: AWS Hubble vs on-prem Hubble outputs, and migrated data integrity
- Signal B: Hubble MarketTradeSummary → Signal B Processor → Adapter → FIX 35=AE to participants, via the devdmz cluster (NLB / F5 / ForgeRock), including session management, rejects and recovery
- HUBDAM data archive: every archived Hubble message type lands in DAS/DAPS; functional purging

### 3.3 Out of scope (owner)

| Item | Owner |
|---|---|
| Single-service rule matrices | SLFT |
| Throughput, latency, soak, report-generation SLAs (HUBES-600, 726, 926, 1535, 656, 925, 1532, 645, 929, 1536, 1893, 2151, 928, 1539, 1514, 2541, 2542, 1515, 2915) | SPT / SLPT |
| AZ loss, cross-region DR, backup restore, HA timing (HUBES-1590, 592, 595, 625, 1595, 1599, 1803) | OAT / DR |
| Deployment pipeline, monitoring, runbooks (HUBES-593, 1592–1594, 1598) | Release / OAT |
| SAST, accessibility (HUBES-1596, 1597) | Pipeline gates |
| EKS/Aurora provisioning correctness (IaC) | Platform team (SIT consumes their validation evidence) |
| HUBDAM purging performance (DAPS-PurgingPerformanceTests, HUBDAM-5827) | SPT |
| Signal B participant concurrency and throughput | SPT |

### 3.4 Existing automated suites (starting point)

| Suite | Feature files | What it tests today | In default CI run? |
|---|---|---|---|
| D01 | 31 | Instrument lifecycle, ASX Trade updates, valuation/best price, equity and fixed interest, rollover, reconstruction, code change, IB/QK/QY sorting, schedules, traceability, quote init | Yes |
| D04 | 5 | D04 at multiple times; TOB vs NTQuote latest message; TOB reject windows | Partly (2 are @manual) |
| D33 | 7 | IC CSV smoke, format, index-code sorting, S&P, horizontal recon | Partly (D33-003 @manual) |
| D06 | 4 | Day1/Day2 input, report generation, horizontal recon | Partly (recon @manual) |
| E03 | 3 | New and existing instruments; horizontal recon | Partly (E03-003 @manual) |
| Corporate actions | 16 | Code change, rollover, reconstruction Day1–7, SOD / quote-init / EOD triggers | Yes |
| HUBDAM (DAS/DAPS) | 22 | Per-message-type archive (Quote, Trade, Instrument, IndexPrice, TopOfBook, NTQuote variants, CorporateAction, Participant, MarketStatistic…) + purging (functional and performance) | **No: excluded by the default filter `not @hubdam-data-archive`** |
| CSBT | 3 | Course of Sales and Broker Trade per instrument group + recon | Yes |
| Multi-day root | 2 | Day1/Day2 D01/D04/E03 valuation-price setup | Yes |
| Quote summary enrichment | 3 | AC1–AC8 functional, multi-day/restart, Gatling performance | Confirm runner |
| **Signal B** | 6 | Multi-participant TCR, adapter retransmission, ForgeRock FIX auth, adapter rejects, processor rejects, full E2E | Partly (E2E not in CI; poison-topic assertion commented out) |

---

## 4. System under test: AWS platform

Values below come from **Hubble AWS – Dev**. The SIT environment values (account, cluster and DB names) are to be confirmed; see section 18.

### 4.1 EKS

| Item | Dev (reference) | SIT (to confirm) |
|---|---|---|
| AWS account | datainthub-dev | datainthub-npd (assumed) |
| EKS cluster | hubble-dev-blue / hubble-dev-green | hubble-npd-blue/green (assumed) |
| Namespace | hubble | hubble |
| VPC / CIDR | vpc1 (Syd), 10.74.136.0/23 | TBC |
| Tags | asx_application=Hubble Platform, asx_environment=Dev, asx_data_classification=Protected, eks_karpenter=true | TBC |
| Node groups | hub-apps-az1 / az2 / az3 (2 nodes each, min=max=desired=2) | TBC |
| Node type | m7g.2xlarge (8 vCPU, 32 GB, **Graviton / arm64**), routed subnet | TBC |
| Taint | node-group=hub-apps:NoSchedule | same |
| Labels | app=hubble-applications, node-az=hub-apps-azN | same |
| Resource limits | per the Service Resource Limits page | same |

### 4.2 Devdmz (SignalB edge)

| Item | Value |
|---|---|
| Account / cluster / namespace | datainthub-devdmz · hubble-devdmz-blue/green · hubble |
| CIDR | 10.76.104.0/23 |
| Ingress | NLB for SignalB adaptor (FIX endpoint, port 4500); F5 endpoint AMOClient.signalb.aws.dev.asx.com.au |
| Access | Via zproxy:8083; the Ops VM subnet is in the master authorised network |

### 4.3 Aurora PostgreSQL

| Item | Dev | NPD |
|---|---|---|
| Cluster / DB | hubdevdb01 | hubnpddb01 |
| Instance | db.r7g.large (2 vCPU / 16 GB), 1 writer + 1 reader, 7-day retention, 500 GB | TBC |
| Users | hubbledevdb_deploy_user (deployment), hubbledevdb_app_user (application), hubbledevdb_recon_user (recon) | hubblenpddb_deploy_user / _app_user / _recon_user |
| Layout | One database per microservice, Liquibase-managed (DATABASECHANGELOG / DATABASECHANGELOGLOCK). Snapshot DBs carry PriceSumFlushOffset; QuoteCapture, ValuationPrice and SecurityStreaming carry PartitionOffset. | same |

### 4.4 Other platform components

| Component | Detail | SIT relevance |
|---|---|---|
| S3 | hubble-applications-sbox (dev), auth via EKS Pod Identity | Report delivery and file ingestion; no static keys |
| Enterprise Kafka AWS | Confluent on EKS (ent-kafka), nonprod 10.74.7.0/24, ports 9092/9094/443 | All topics; schema registry |
| Certificates / DNS | CN hubble-platform-dev; SANs hubble-verification-service.dev…, streaming.signalb.dev…, *.dev.datainthub.nonprod.aws.asx | TLS for verification and SignalB streaming |
| Identity | ForgeRock IdP (gateway.sit1.ciam…, gateway.dev.ciam…, qimfa.asx.com.au), TCP 443 | Client auth for SignalB and verification service |
| Daytona | QA qtxfly201-mgmt 10.113.30.3; customer test qfixflyer221 10.113.30.2; TCP 8080, 61616, 22345, 22350, 12346 | Upstream/downstream connectivity |
| Legacy SQL Server | QHUBDB221.asx.com.au 172.20.191.190:54480 | Migration parity and reconciliation source |

### 4.5 Documented network flows (each one is tested in feature #9)

| From | To | Ports |
|---|---|---|
| GitLab prod (devops-npd 10.74.54.0/24) | Hubble Dev EKS and Devdmz EKS | 22, 443 |
| Hubble Dev EKS, Devdmz EKS | ForgeRock IdP | 443 |
| Devdmz EKS | Hubble Dev Aurora | 5432 |
| Devdmz EKS | Enterprise Kafka AWS nonprod | 9092, 9094, 443 |
| Hubble Dev EKS | Daytona nonprod | 8080, 61616, 22345, 22350, 12346 |
| Hubble Dev EKS | SQL Server Test QHUBDB221 | 54480 |
| Hubble Dev EKS | Enterprise Kafka, EMS, SFTP, Elasticsearch | **Not documented; confirm (section 18)** |

### 4.6 Signal B

| Component | Role | Touch-points |
|---|---|---|
| Signal B Processor | Consumes Hubble MarketTradeSummary from Kafka, applies participant routing and masking; invalid messages go to the business poison topic | Kafka (MTS in, poison out), Aurora |
| Signal B Adapter | FIX engine for participants: logon (35=A), heartbeat/test request (35=0/1), TCR request (35=AD) → ack (35=AQ) → reports (35=AE), resend/gap-fill, session (35=3) and business (35=j) rejects | FIX over NLB :4500 / F5 AMOClient endpoint (devdmz) |
| ForgeRock IdP | Authenticates FIX participants at logon | TCP 443 |
| DB scheduler | Opens and closes the Signal B trading day; controls allowed logon hours | Aurora |
| Daytona (qfixflyer / qtxfly) | Most likely the FIX participant simulator for QA and customer-test environments (to confirm, Q6) | TCP 8080, 61616, 22345, 22350, 12346 |

---

## 5. SIT levels

| | L1 Interface | L2 Flow integration | L3 End-to-end business cycle |
|---|---|---|---|
| Proves | Every connection, identity, certificate, DB role and schema is correct, and the EKS baseline matches the design | Data crosses service boundaries and lands in the correct Aurora tables; recovery from stored offsets; platform events cause no loss | Products and SignalB feeds are correct, on time, delivered, reconciled and equal to on-prem Hubble |
| Input at | Platform APIs (kubectl, AWS), real upstream service or queue | Source boundary: EMS, Kafka, S3/SFTP drops, reference data | Source boundary + schedule or business-date trigger |
| Assert at | Cluster state, DB catalog, TLS handshake, consumer lag | Kafka topics, Aurora tables, offset tables, ES traces | Report files on S3/SFTP, SignalB endpoint, recon reports, legacy comparison |
| Share of SIT scenarios | ~15% | ~50% | ~35% |
| Runtime target | < 10 min | < 15 min per feature | Single day < 30 min; multi-day overnight |

---

## 6. Quality gates

| Gate | When | What runs / checks | Pass if | Owner · on fail |
|---|---|---|---|---|
| **G0 Story ready** | Before sprint | ACs marked SLFT/SIT; integration impact named; BA-signed expected values; test data identified | All present on the Jira story | BA + SIT QA · story not pulled |
| **G1 SIT entry** | Every deploy | SLFT green → **EKS cluster validation** → Aurora schema/role check → L1 interface pack → @smoke | 100% pass, ≤ 30 min | GoCD (automatic) · build not accepted |
| **G2 Story integrated** | Per story | New/changed L2/L3 scenarios tagged @HUBES + impacted flows | Passing; RTM shows SLFT + SIT evidence | SIT QA · story stays In Test |
| **G3 Nightly regression** | Nightly | L1 + L2 + single-day L3; cluster validation before and after; platform-health capture | ≥ 98% pass; failures triaged by 10:00 | SIT lead · 2 red nights freezes promotion |
| **G4 SIT exit** | Release | Full regression + @multiday + @resilience + blue/green cutover + recon + migration parity | 100% of P1 executed, ≥ 95% pass; no Sev 1/2 open; RTM published | Test Manager + PO · RC rejected |

---

## 7. SIT feature list and coverage

**Coverage:** **Covered** means automated, in CI, with minor gaps only. **Partially covered** means a test exists but is manual, only checks the report, or covers only some cases. **Not covered** means there is no SIT test.

### 7.1 L1 Interface

| # | SIT feature | What it must prove | Coverage | Today / what's missing |
|---|---|---|---|---|
| 1 | Kafka producer → consumer contracts | Every real producer/consumer pair on Enterprise Kafka AWS is connected and schema-compatible | **Not covered** | Only implicit in Hooks setup |
| 2 | EMS queue integration | ASX_TRADE and nCore queues deliver to the right ingestion services | **Partially covered** | EmsSteps injects messages but doesn't check delivery |
| 3 | S3 / SFTP file locations | Inbound drop and outbound report locations are wired | **Partially covered** | Outbound read only; inbound drops not tested |
| 4 | Elasticsearch log sink | Every service logs structured JSON to ES with its service name | **Not covered** | None |
| 5 | EKS platform baseline | Cluster, node groups, taints, labels, instance types, AZ spread and storage match the design | **Not covered** | Reusable cluster-validation script exists (Enterprise Kafka project); not yet applied to Hubble |
| 6 | Hubble workload deployment and configuration | Every Hubble deployment/statefulset runs the release image (arm64), with replicas, config maps, secrets, tolerations and resource limits as designed | **Partially covered** | KubeUtil only scales statefulsets |
| 7 | Aurora connectivity and DB user roles | Services use the app user on their own DB; recon is read-only; deploy is migrations only | **Not covered** | None |
| 8 | Aurora schema version and config consistency | Liquibase state matches the release; no stray tables; TAS config tables consistent | **Not covered** | None |
| 9 | Network paths and firewall rules | Every documented flow (section 4.5) is reachable, and undocumented flows are blocked | **Not covered** | None |
| 10 | Certificates, DNS and endpoints | TLS certificates are valid with the correct SANs; hosted-zone records resolve; NLB/F5 endpoints answer | **Not covered** | None |
| 11 | Identity and access | S3 access via Pod Identity (no static keys); ForgeRock token flow for SignalB/verification clients | **Not covered** | None |

### 7.2 L2 Flow integration

| # | SIT feature | What it must prove | Coverage | Today / what's missing |
|---|---|---|---|---|
| 12 | ASX Trade → processing | Stats, trades, TOB and OB directory reach quote capture and trade enrichment; cancel, amend and duplicate handling | **Partially covered** | Setup data in D01-003/004, D04-002, CSBT; hand-off not checked |
| 13 | Reference data propagation | nCore instrument, issuer, index and CA changes reach every consumer | **Partially covered** | Only through D01 NewInstrument |
| 14 | Third-party feeds | S&P/GRIP, MorningStar and OIIP flow through ingestion and S&P enrichment | **Partially covered** | One S&P path (D33-006) |
| 15 | DCS / DPS EOD files | CORE, Margin Price and Index XBW are ingested and used downstream | **Not covered** | None |
| 16 | Calendar-driven behaviour | Holidays and half-days change SOD, cut-offs and schedules | **Not covered** | None |
| 17 | Start-of-day sequence | SOD topics, SOD prices and quote init complete before open | **Partially covered** | D01-008/029 run quote init; SOD topics not checked |
| 18 | Quote → valuation chain | Quote, NTQuote enrichment, valuation, footnotes and option values flow to streaming | **Partially covered** | D01-005 at report level; TOB reject window manual |
| 19 | Cross-day valuation | Cancel reversal, strike after code change, valPriceMethodFlag across days | **Partially covered** | HUBES-3277/3278 only |
| 20 | Trade enrichment → TAS | Enriched trades drive every TAS criterion including MN and MV | **Partially covered** | D06 report level; MN/MV none |
| 21 | Service → own Aurora table | Each service writes correct rows to its own table (see section 9) | **Not covered** | No Aurora assertions |
| 22 | Equity → EquityPriceSumSnapshot | Equity flow persisted correctly | **Not covered** | None |
| 23 | Fixed interest → FixedInterestPriceSumSnapshot | FI flow persisted correctly | **Not covered** | D01-012 report only |
| 24 | Derivatives → FutureContractSumSnapshot / DerivatixPriceSumSnapshot | QX/QZ flows persisted correctly | **Not covered** | None |
| 25 | Index → IndexPriceSumCapture / IndexPriceSumSnapshot | IB/MI flows persisted correctly | **Not covered** | D01-011 report only |
| 26 | TAS → TradeAggregation*Snapshot → MarketTradeSummarySnapshot → Signal B | Aggregates and trade summary persisted and published | **Not covered** | None |
| 27 | ODS reference and aggregate tables | CalendarDay, CorporateAction, CumAggrTrade*, asx_trade_extract, AsxMissingTrade consistent with the service snapshots | **Not covered** | None |
| 28 | Flush consistency | Snapshot tables match stream state within the flush window; no partial rows | **Not covered** | None |
| 29 | Offset persistence and restart | PartitionOffset / PriceSumFlushOffset advance; a restarted pod resumes exactly with no gap or duplicate | **Not covered** | None |
| 30 | Date roll across services | Day N → N+1 refreshes every service (BusinessDay, caches) with no carry-over | **Partially covered** | QSE restart; D01-028 prototype |
| 31 | Scheduler DB-driven behaviour | ReportSchedule / ScheduleOverride / CalendarDay changes drive report timing | **Not covered** | Tests use wall-clock waits |
| 32 | Pod restart and node drain | Pods killed or evicted (node drain) reschedule onto hub-apps nodes and resume with no loss | **Not covered** | KubeUtil only clears cache |
| 33 | Rolling deployment | A rolling update under live flow loses nothing; old and new versions both work on the same schema; Liquibase lock respected | **Not covered** | None |
| 34 | Aurora writer failover (functional) | Services reconnect through the cluster endpoint; no lost or duplicate rows | **Not covered** | None; failover timing stays with OAT |
| 35 | Aurora unavailable / pool exhausted | Services pause consumption, don't lose messages, and recover when the DB returns | **Not covered** | None |
| 36 | Kafka / schema-registry interruption | Enterprise Kafka broker or schema registry restart is recovered functionally | **Not covered** | None |
| 37 | Platform health during integrated run | Across a full SIT day: no OOMKilled, no crash loops, no unexpected restarts, no Warning events, usage within limits | **Not covered** | None |
| 38 | End-to-end correlation | One traceId from TIBCO BW through every service to ES | **Partially covered** | D01 path only |

### 7.3 L3 End-to-end business cycle

| # | SIT feature | What it must prove | Coverage | Today / what's missing |
|---|---|---|---|---|
| 39 | Product smoke pack | Every product produced for one instrument per asset class | **Partially covered** | D33-001, D33-007 only |
| 40 | D01 Daily Official List | QK/QY/IB content, sorting, CSV–XML parity, recon | **Covered** | CSV–XML parity and HUBES-720 recon to add |
| 41 | D04 Derivatives | QX and QZ intraday/EOD, recon | **Partially covered** | QX content not checked; recon and reject window manual |
| 42 | D06 Summary & Turnover | Turnover, sector, market movers, index summary, recon | **Partially covered** | Recon manual; traceability missing |
| 43 | D33 Closing Index Prices | IC XML/CSV, sorting, S&P, recon text report | **Covered** | Recon text report missing; D33-003 manual |
| 44 | E03 EOD Snapshot | All six datasets, traceability, recon | **Partially covered** | QP/QQ not checked; recon manual |
| 45 | Course of Sales / Broker Trade | Groups, trade conditions TA–TI, T+3 window | **Partially covered** | Conditions and T+3 not checked |
| 46 | Report scheduling | Normal, half-day and holiday schedules; re-trigger | **Partially covered** | D01-009 normal day only |
| 47 | Delivery failure and replay | S3/SFTP outage → poison topic → replay with no duplicate file | **Not covered** | None |
| 48 | EDW lag and EOD notification | ETL extract completion and lag alerts | **Not covered** | None |
| 49 | Corporate action: code change | Day 1–3, with and without reservation | **Covered** | 6 features automated |
| 50 | Corporate action: reconstruction | Day 1–7 across EQY, COP, CNV, FIN, IBD | **Covered** | Asset-class matrix to confirm |
| 51 | Corporate action: rollover | Day 1–5, reflected in D04/E03 | **Partially covered** | Not tag-linked; D04/E03 impact not checked |
| 52 | Forward-dated effective dates | Changes appear only from their effective date | **Not covered** | None |
| 53 | Multi-day valuation in products | Valuation changes visible across D01, D04, E03 | **Partially covered** | D04/D01/E03 multi-day test is manual |
| 54 | Product = database | D01/D04/D06/E03 values equal the Aurora snapshot rows they were built from | **Not covered** | None |
| 55 | Reconciliation using recon user / reader | Recon runs as recon user (on the reader endpoint where designed) and matches the writer | **Not covered** | None |
| 56 | SignalB delivery via devdmz | SignalB receives streaming and summary data via the NLB (4500) / F5 endpoint with ForgeRock auth; the devdmz → Aurora path works | **Not covered** | None |
| 57 | Blue/green cluster cutover | Switching hubble-*-blue → green mid-cycle: only one cluster consumes and writes; no double processing; offsets continue; products unchanged | **Not covered** | None |
| 58 | Migration parity: AWS vs on-prem | For the same inputs and day, AWS Hubble products equal on-prem Hubble products (QHUBDB221 / legacy outputs) | **Not covered** | None |
| 59 | Migrated data integrity | Reference and historical data migrated from SQL Server to Aurora match the source (counts, checksums, key samples), including the 27M historical trades used by CS/BT | **Not covered** | None |
| 60 | Daytona integration | Hubble ↔ Daytona messages flow on the documented ports in the QA and customer-test environments | **Not covered** | None |

### 7.4 Signal B and HUBDAM

| # | Level | SIT feature | What it must prove | Coverage | Today / what's missing |
|---|---|---|---|---|---|
| 61 | L1 | Signal B network and TLS path | A FIX client reaches the adapter through F5 / NLB :4500 into devdmz with a valid certificate; devdmz reaches Enterprise Kafka and Aurora | **Not covered** | None; blocked by the SAN typo (finding 2) |
| 62 | L2 | Hubble MTS → Signal B Processor hand-off | Real MarketTradeSummary from Hubble TAS (not seeded) is consumed with a compatible schema; invalid MTS goes to the business poison topic | **Partially covered** | Processor reject suite exists, but its poison-topic assertion is commented out (schema mismatch) |
| 63 | L2 | Signal B trading-day lifecycle | The DB scheduler opens and closes the day; logon outside hours rejected; sequence numbers reset at SOD; Signal B follows the Hubble date roll | **Partially covered** | ForgeRock suite covers outside-hours logon only |
| 64 | L2 | Signal B recovery | Processor or adapter pod restart and devdmz blue/green switch during a session: participants reconnect, sequence numbers are preserved, and no 35=AE is missed or duplicated | **Not covered** | None |
| 65 | L3 | Multi-participant TCR delivery | Each participant gets only its own filtered 35=AE set (buyer/seller routing, one-side masking, field mapping) | **Covered** | Multi Participant Trade Confirmation Reports feature, including @masking |
| 66 | L3 | FIX session management and retransmission | Resend request, gap-fill vs no gap-fill, PossDupFlag=Y, reconnection and state restoration | **Covered** | Adapter Retransmission feature |
| 67 | L3 | ForgeRock FIX authentication | Logon, heartbeat and logout; unregistered participant, invalid password and out-of-hours logon rejected | **Covered** | ForgeRock feature |
| 68 | L3 | Adapter session and business rejects | 35=3 for malformed messages, 35=j for anything other than AD, and second logon with 141=Y rejected | **Covered** | Adapter Service Reject Messages feature |
| 69 | L3 | Signal B full E2E in CI | nCore via EMS + ASX Trade OrderBookEvent/TradeEvent via Kafka → Hubble → Signal B → participant receives the correct 35=AE | **Partially covered** | E2E feature exists but is not in the normal CI run |
| 70 | L3 | Trade corrections to participants | An ASX Trade cancel or amend after a report was sent produces the correct corrected or cancelled 35=AE for both sides | **Not covered** | None |
| 71 | L3 | Signal B traceability | One traceId from ASX TradeEvent → MTS → Processor → Adapter → 35=AE, visible in ES | **Not covered** | None |
| 72 | L2 | HUBDAM data archive (functional) | Every archived message type is stored correctly in DAS; functional purging removes only eligible data | **Partially covered** | 22 features exist, but the default filter excludes `@hubdam-data-archive`, so they don't run in CI |

### 7.5 Coverage totals

| Level | Covered | Partially covered | Not covered | Total |
|---|---|---|---|---|
| L1 Interface | 0 | 3 | 9 | 12 |
| L2 Flow integration | 0 | 12 | 19 | 31 |
| L3 End-to-end | 8 | 9 | 12 | 29 |
| **Total** | **8 (11%)** | **24 (33%)** | **40 (56%)** | **72** |

The existing suite is strong at L3 for Hubble reports and for Signal B's FIX behaviour. There is no coverage yet of the AWS platform, Aurora persistence, recovery (Hubble or Signal B), blue/green, migration parity, or the real Hubble → Signal B hand-off in CI.

---

## 8. EKS platform validation (feature #5, #6, #37)

### 8.1 Reusing proven automation: summary for management

> **We are not building EKS validation from scratch.** The Enterprise Kafka AWS project already runs an automated EKS cluster validation, and it is in use today. Its latest run against **ent-kafka-nft-green** (7 Aug 2026) passed **73 of 73 checks**. Hubble runs on the same ASX EKS platform standards, so about **70% of the check types carry over as-is or through configuration alone**. The remaining ~30% are Hubble-specific additions.

**Why this lowers risk**

| Confidence factor | Evidence |
|---|---|
| Already in use | Runs today for the Enterprise Kafka AWS project; latest report 73/73 passed |
| Same platform | Same ASX EKS conventions as Hubble: EKS 1.35, Bottlerocket nodes, per-AZ node groups, `node-group` NoSchedule taints, `nodegroup_name` / `node-az` labels, system node group per zone, ap-southeast-2a/b/c |
| No new tooling | Plain kubectl and shell; no licences or new infrastructure; needs only read-only kubectl access to the SIT cluster |
| Auditable evidence | Produces a timestamped pass/fail report with the exact command and output for every check, which we attach to each SIT run |
| Covers a direct dependency | Hubble and Signal B consume Enterprise Kafka AWS. Running the same script against the Kafka cluster gives a ready-made dependency health check at G1 |

**What we reuse, and to what extent**

| Extent | Check types | Count |
|---|---|---|
| **Reuse as-is** (no change) | Nodes Ready; node status; system node group in every zone; storage classes available; diagnostics (pod, service and node details, labels, taints, describe pods/nodes, events listing, top nodes/pods); pass/fail report format | 11 |
| **Reuse with configuration** (expected-values file only) | Cluster and namespace; node count; app + node-group labels; instance type (m7g.2xlarge); topology zone spread; node taints (hub-apps); node group / zone uniqueness; pod Running and Ready (Hubble pod list); service checks (Hubble service list); PVC bound (if Hubble uses PVCs); storage class exists and spec | 12 |
| **Extend** (small logic change) | Fail on Warning events, which the Kafka version passes; check that every service has endpoints | 2 |
| **New for Hubble** | Image tag and registry vs release manifest; arm64 architecture; pod placement, tolerations and AZ spread; restarts / OOMKilled / CrashLoopBackOff; requests and limits vs the Service Resource Limits page; config map and secret references; Pod Identity with no static AWS keys; only one blue/green cluster active | 8 |
| **Total** | 23 of 33 check types reused (as-is or configured), 2 extended, 8 new | **33** |

**Where it is used in SIT**

| Use | Gate / feature |
|---|---|
| Platform gate before any functional test; build rejected on failure | G1, feature #5 |
| Hubble workload baseline (with the new checks) | G1, feature #6 |
| Before and after each @resilience test, to prove the cluster returned to baseline | Features #32–#34, #57, #64 |
| Before and after the nightly run, to catch restarts, OOMs and warnings during a full SIT day | G3, feature #37 |
| Against the Enterprise Kafka cluster, as a dependency check | G1 |
| Against the devdmz cluster, for Signal B | G1, features #61, #64 |

**What it does not do** (covered elsewhere in this strategy)
- It validates platform and deployment **state**. It doesn't test Hubble or Signal B **behaviour**; the L2/L3 features do that.
- It doesn't inject faults. Pod delete, node drain, rollout and Aurora failover are done by the new KubeSteps and AWS SDK steps (section 12). The script only confirms the before and after state.
- It doesn't replace the platform team's IaC validation or OAT's AZ/DR testing.

**Effort.** Phase 0 (sprint 1): create the Hubble expected-values files, add the 2 extensions, build the 8 new checks, and wire it into G1. The Kafka project owner should review the changes so both projects stay on one shared script rather than a fork.

### 8.2 Approach

Reuse the **cluster validation script from the Enterprise Kafka AWS project**, which already produces a pass/fail report of about 73 checks using kubectl. Parameterise it for Hubble: set the cluster, namespace and an expected-values file per environment. Run it:

- at **G1**, before any functional test (the build is not accepted if it fails)
- **before and after** every @resilience scenario and the nightly run (feature #37)
- attach the report to the ExtentReports output as SIT evidence

### 8.3 Checks: reused and Hubble expected values

| Check (from existing script) | Hubble expected value | Change needed |
|---|---|---|
| Cluster nodes Ready | All hub-apps and system nodes Ready | Parameterise |
| Node count | 6 hub-apps nodes (2 per AZ) + system nodes | Expected-values file |
| App + node-group label | app=hubble-applications, nodegroup / node-az = hub-apps-az1/2/3 | Expected-values file |
| Instance type per node group | m7g.2xlarge | Expected-values file |
| Topology zone | 2 hub-apps nodes in each of ap-southeast-2a/b/c | Expected-values file |
| Node taint | node-group=hub-apps:NoSchedule on 6 nodes | Expected-values file |
| System node group per zone | Present in every zone | Reuse as is |
| StorageClass exists / spec | encrypted-gp3 (and any class Hubble PVCs use) | Confirm whether Hubble uses PVCs |
| PVC Bound | Only if Hubble statefulsets use PVCs | Confirm |
| Pod checks (Running and Ready) | Every Hubble deployment/statefulset from Hooks.setup (asx-trade-ingestion x8, index, instrument, calendar, corporate-action, issuer, quote-capture, valuation-price, trade-enrichment, trade-aggregation variants, scheduler, security-streaming, index-streaming, snapshots, outbound, QSE, NTQuote) | Replace pod list |
| Service checks | Every Hubble service exists **and has endpoints** | Add endpoint check |
| Events | **Fail on any Warning event** in namespace hubble | **Fix:** the Kafka report passed despite a `FailedToRetrieveImagePullSecret` warning |
| Top nodes / top pods | Usage within the Service Resource Limits page | Report only |

### 8.4 New Hubble-specific checks to add

| Check | Expected |
|---|---|
| Image tag and registry | Every container image matches the release manifest and comes from images-proxy-group.upm.asx.com.au |
| Architecture | Every image has an arm64 (or multi-arch) manifest, because the nodes are Graviton m7g |
| Pod placement | Hubble pods run only on hub-apps nodes, carry the hub-apps toleration and node affinity, and multi-replica services span ≥ 2 AZs |
| Restarts | Restart count 0 at start; no OOMKilled or CrashLoopBackOff |
| Requests / limits | Set on every container and equal to the Service Resource Limits page |
| Config and secrets | Config maps and secrets referenced by each pod exist; DB endpoint is the Aurora cluster endpoint (writer) and reader where designed |
| Pod Identity | Pods accessing S3 carry eks.amazonaws.com/pod-identity=enabled; no AWS keys in env or secrets |
| Blue/green | Exactly one of the blue/green clusters has active Hubble consumers for a given environment |

---

## 9. Aurora (RDS) validation (features #7, #8, #21–#29, #34, #35, #54, #55)

### 9.1 Database inventory and what SIT asserts

| Service DB | Key tables | SIT asserts |
|---|---|---|
| HubbleScheduler | ReportSchedule, ReportScheduleOverride, Schedule, ScheduleOverride, CalendarDay, lookups | Overrides and calendar drive report timing (#31, #46) |
| HubbleQuoteCapture | Quote, PartitionOffset, InstrumentEnrichment | Quotes from TOB + stats; offset resume (#18, #29) |
| HubbleValuationPrice | QuoteSummary, BusinessDay, PartitionOffset, InstrumentEnrichment | Valuation rows; business-day roll; offset resume (#18, #19, #30) |
| HubbleNTQuoteEnrichment / HubbleTradeEnrichment | InstrumentEnrichment | Enrichment reference loaded from SOD (#13, #17) |
| HubbleSecurityStreaming | TradeAndQuoteData, PartitionOffset | QK/QY/QX/QZ stream state (#22–#24) |
| HubbleIndexStreaming | IndexPriceSumCapture | IB/MI capture (#25) |
| HubbleEquitySnapshot / FixedInterestSnapshot / IndexSnapshot / FutureContractSnapshot / DerivatixPriceSumSnapshot | *PriceSumSnapshot / *SumSnapshot, PriceSumFlushOffset | Snapshot rows and flush offsets (#22–#25, #28, #29) |
| HubbleTradeAggregation{AsxCode, Custom, IndexComposition, InstType, InstTypeCustom, Option, SectorCode} | InstrumentTypeList, InstrumentTypeListMapping | Config lists seeded and consistent (#8, #20) |
| HubbleTradeAggregation{Custom, IndexComposition, Option, SectorCode}Snapshot | TradeAggregation*Snapshot, PriceSumFlushOffset | Aggregates per criterion (#20, #26) |
| HubbleMarketTradeSummarySnapshot | MarketTradeSummarySnapshot, PriceSumFlushOffset | Trade summary for Signal B (#26) |
| HubbleQuoteSummaryEnrichmentSnapshot | QuoteSummaryEnrichmentSnapshot, PriceSumFlushOffset | Market movers for D06 (#42) |
| HubbleODSPreProd | CalendarDay, CorporateAction, CumAggrTrade, CumAggrTradeIntraday*, asx_trade_extract, AsxMissingTrade, reference lookups | Reference and aggregates reconcile (#27) |
| All DBs | DATABASECHANGELOG, DATABASECHANGELOGLOCK | Schema version and no stale lock (#8) |

### 9.2 Key scenarios

- **Roles (#7).** Each service's session uses `…_app_user` on its own database. The app user can't run DDL. The recon user can SELECT only. No runtime session uses `…_deploy_user`.
- **Schema (#8).** DATABASECHANGELOG matches the release changeset list in every database. DATABASECHANGELOGLOCK isn't held. No tables outside an approved list, such as `Schedule_CHG0073369`, `CalendarDay_CHG0075327` or `AsxMissingTrade_Backup_2026Mar02`.
- **Persistence (#21–#28).** For each flow, the expected rows appear in the service table and the snapshot table within the flush window, and the values match the baseline.
- **Offsets (#29).** A pod is deleted mid-flow and resumes from PartitionOffset / PriceSumFlushOffset. Row counts and values equal a baseline run with no restart.
- **Failover (#34).** An Aurora writer failover during a live flow: services reconnect without a manual restart and tables equal the baseline.
- **Recon (#55).** Recon runs as the recon user against the reader. Results equal a writer query once replica lag has settled.

---

## 10. Example scenarios

```gherkin
@L1 @smoke @HUBES-xxxx
Scenario Outline: Hubble EKS node group matches the design
  Given the SIT EKS cluster "<cluster>" and namespace "hubble"
  Then node group "<nodegroup>" has 2 Ready nodes in zone "<zone>"
  And each node has instance type "m7g.2xlarge" and architecture "arm64"
  And each node has taint "node-group=hub-apps:NoSchedule"
  And each node has labels "app=hubble-applications" and "node-az=<nodegroup>"
  Examples:
    | cluster          | nodegroup    | zone            |
    | hubble-npd-green | hub-apps-az1 | ap-southeast-2a |
    | hubble-npd-green | hub-apps-az2 | ap-southeast-2b |
    | hubble-npd-green | hub-apps-az3 | ap-southeast-2c |

@L2 @resilience @serial @HUBES-xxxx
Scenario: Equity snapshot resumes from its flush offset after a pod restart
  Given business date is Day 1
  And the "HubbleEquitySnapshot.PriceSumFlushOffset" value is recorded
  When 500 ASX Trade TOB and trade messages are published for 20 equities
  And the "equity-snapshot" pod is deleted after 250 messages
  And the "equity-snapshot" pod is Ready again
  Then "PriceSumFlushOffset" is greater than the recorded value
  And "EquityPriceSumSnapshot" matches the baseline run with no duplicates

@L3 @resilience @serial @HUBES-xxxx
Scenario: Blue/green cutover during the trading day does not double-process
  Given Hubble is active on cluster "hubble-npd-blue"
  And intraday ASX Trade flow is running
  When traffic is cut over to cluster "hubble-npd-green"
  Then only "hubble-npd-green" consumer groups are active
  And no Aurora snapshot table has duplicate rows for the same instrument and snapshot time
  And the EOD D01, D04 and E03 match the baseline run
```

---

## 11. Test environment and access requirements

| Need | Detail | From |
|---|---|---|
| SIT EKS cluster | Dedicated blue/green pair in the SIT account, namespace hubble, same topology as prod-like design | Platform |
| kubectl access from the test runner | kubeconfig / IAM role for the SIT cluster; proxy settings as per the AWS EKS Cluster access page (zproxy:8083) | Platform |
| Aurora access | Cluster writer and reader endpoints; recon user for assertions; **dedicated SIT test user** with DML on reset tables only (not the deploy user); credentials from AWS Secrets Manager | DBA |
| AWS permissions (SIT account only) | Aurora `failover-db-cluster`, node cordon/drain, S3 read/write on the SIT bucket | Platform + Security |
| Enterprise Kafka AWS | SIT topics, consumer-group ACLs for the test producer/consumer, schema registry access | Kafka platform |
| Network | Test runner → EKS API, Aurora 5432, Kafka 9092/9094, S3, ES, SFTP, EMS; the Hubble flows in section 4.5 opened for SIT | Network |
| Simulators | S&P/GRIP, MorningStar, OIIP, DCS/DPS file fixtures, Daytona test endpoints | SIT team |
| Test data | Golden datasets per asset class; calendar with a holiday and a half-day; BA-signed expected values | SIT team + BA |
| Legacy comparison | Read access to on-prem Hubble outputs and QHUBDB221 for parity (#58, #59) | Legacy Hubble team |

---

## 12. Framework changes (enablers)

| Enabler | What | Needed by |
|---|---|---|
| Postgres in DatabaseUtil | Add PostgreSQL JDBC driver; per-service DB config on the Aurora cluster endpoint; keep MSSQL for legacy parity | #7, #8, #21–#29, #54, #55 |
| Cluster validation integration | Wrap the reused script as a Cucumber step and G1 gate; expected-values file per environment; attach the report | #5, #6, #37 |
| KubeSteps for EKS | Pod delete, node cordon/drain, rollout restart, image/arch check, blue/green consumer check | #32, #33, #37, #57 |
| AWS SDK steps | Aurora failover, Pod Identity checks, S3 via role | #11, #34 |
| Network and TLS probes | Port reachability from inside a pod (ephemeral debug pod); TLS SAN and expiry check | #9, #10 |
| Business-date control | Reusable `Given business date is Day N` step (calendar + metadata + scheduler) | #16, #30, multi-day |
| Scheduler override steps | Write ScheduleOverride / ReportScheduleOverride instead of wall-clock waits | #31, #46, manual → CI |
| File injection | Upload fixtures to S3/SFTP and await ingestion | #3, #15 |
| Golden-file and DB-to-report diff | Field-level XML/CSV diff; product-vs-snapshot comparison | #40–#45, #54, #58 |
| RTM and tag lint | RTM from Cucumber JSON; CI fails a Scenario without @L1/@L2/@L3 and @HUBES tags | G2, G4 |

---

## 13. Execution model and tags

| Pack | Tag expression | When | Budget |
|---|---|---|---|
| Platform gate | `@L1 and @platform` (cluster validation, Aurora roles/schema, network, TLS) | Every deploy (G1) | ≤ 10 min |
| Smoke | `@smoke` | Every deploy (G1) | ≤ 20 min |
| Regression | `not @manual and not @multiday and not @resilience` | Nightly (G3) | ≤ 3 h |
| Multi-day | `@multiday` | Scheduled chain, twice weekly | Overnight |
| Resilience | `@resilience` (pod, node, rollout, Aurora failover, blue/green) | Weekly and before release | ≤ 2 h |
| Migration parity | `@parity` | Each migration rehearsal and before cutover | Per run |
| Signal B | `@signalb and not @manual` (includes E2E) | Nightly with regression | ≤ 45 min |
| HUBDAM archive | `@hubdam-data-archive and not @performance` | Nightly, separate lane | ≤ 1 h |

Mandatory tags on every Scenario: `@L1|@L2|@L3`, `@HUBES-nnn`, `@p1|@p2|@p3`. Stateful or destructive scenarios also carry `@serial`.

---

## 14. Entry and exit criteria

**Entry**
- Build deployed to SIT; image versions recorded; SLFT green for every changed service
- EKS cluster validation, Aurora role and schema checks, and L1 pack green
- Test data, simulators and BA-signed expected values available

**Exit**
- 100% of P1 features executed; ≥ 95% passing; no open Sev 1/2
- Resilience pack, blue/green cutover and migration parity passed, or signed waiver
- Horizontal recon clean for every product
- RTM published with SLFT + SIT evidence; SPT/OAT evidence linked for out-of-scope items

---

## 15. Defect management

| Severity | Definition (SIT) | Example |
|---|---|---|
| Sev 1 | Wrong or missing published product, data loss or duplication, platform unusable | D01 missing instruments; duplicates after pod restart |
| Sev 2 | Integration failure with a workaround, or a failed resilience or security control | Service connects as the deploy user; Warning events on start |
| Sev 3 | Minor data or format issue with no customer impact | Log field missing |
| Env | Environment or configuration issue, not a product defect | Firewall rule missing in SIT |

Each nightly failure is triaged by 10:00 as defect, environment or test issue.

---

## 16. Roles and responsibilities

| Activity | Service squads | SIT team | BA | Platform (EKS) | DBA (Aurora) |
|---|---|---|---|---|---|
| SLFT | **Own** | Review | Sign values | — | — |
| L1 platform checks | Consulted | **Own** | — | Expected values, access | Roles, schema list |
| L2 flows and resilience | Consulted | **Own** | Consulted | Fault-injection support | Failover support |
| L3 products, parity, blue/green | — | **Own** | Golden files | Cutover support | — |
| Framework and RTM | Contribute | **Own** | — | — | — |
| Gate sign-off | G1 (SLFT) | G2–G4 | G0 | G1 (env) | G1 (DB) |

---

## 17. Risks and assumptions

| Risk / assumption | Impact | Mitigation |
|---|---|---|
| SIT account and cluster not yet defined (only Dev/Devdmz documented) | Can't build the platform checks | Agree the SIT environment design (section 18) in Phase 0 |
| Destructive tests (drain, failover, cutover) not permitted in the shared SIT environment | Resilience coverage blocked | Agree a window and approvals; otherwise run jointly with OAT |
| Blue/green clusters both consuming at once | Double processing into Aurora | Feature #57; consumer-group check in cluster validation |
| arm64 (Graviton) nodes with non-multi-arch images | Pods fail to start | Architecture check in G1 |
| Framework is MSSQL-only | No Aurora assertions | Postgres enabler in Phase 0 |
| The shared EKS validation script forks between the Kafka and Hubble projects | Double maintenance; the two drift apart | One shared script with per-project expected-values files; Kafka owner reviews changes |
| Expected values for pricing and TAS not signed | Tests assert whatever the system produces | BA sign-off at G0 |
| Coverage statuses inferred from feature names | Over- or under-statement | Confirm against step code in Phase 0 |

---

## 18. Design review findings and open questions

**Findings from the design pages** (raise with the owners):

1. **Node label typo.** hub-apps-az3 is labelled `app=hubble-application`, not `hubble-applications`. If node affinity uses the plural form, no Hubble pods will schedule in AZ3.
2. **Certificate SAN typo (Devdmz).** `DNZ.2 = signalb-verification-service.devdmz…` should be `DNS.2`, otherwise that SAN is missing from the certificate.
3. **Scaling model conflict.** The tag `eks_karpenter=true` conflicts with the fixed ASG sizing (min=max=desired=2). Confirm which applies, because it changes node-drain behaviour.
4. **Missing firewall rules.** No documented flow from Hubble Dev EKS to Enterprise Kafka, EMS, SFTP or Elasticsearch. Only Devdmz → Kafka is listed.
5. **Leftover tables in live schemas.** `Schedule_CHG0073369`, `CalendarDay_CHG0075327` and `AsxMissingTrade_Backup_2026Mar02` should be cleaned up or added to an approved list.
6. **No snapshot DB listed** for TradeAggregationAsxCode or TradeAggregationInstType. Confirm where these aggregates are persisted (ODS CumAggrTrade*?).
7. **HubbleODSPreProd table list is truncated** in the design ("continued from source dataset"). The full list is needed for #27.
8. **Enterprise Kafka validation passed despite a warning.** The report passed with a `FailedToRetrieveImagePullSecret` warning. The Hubble version must fail on Warning events.
9. **Signal B poison-topic assertion is commented out** because of a schema mismatch. Invalid MTS handling is untested until the schema is fixed and the assertion restored.
10. **Signal B E2E is not in the CI run.** The only test of the real Hubble → Signal B chain never runs automatically.
11. **HUBDAM suite is excluded from the default run.** The runner filter `not @manual and not @hubdam-data-archive` means 22 archive features don't run in CI. Give them their own scheduled pack instead.

**Open questions**

| # | Question | Owner |
|---|---|---|
| Q1 | Which AWS account, EKS cluster and Aurora cluster host SIT (npd?), and is it blue/green? | Platform |
| Q2 | Are pod delete, node drain, Aurora failover and blue/green cutover allowed in SIT, and in which window? | Platform / DBA |
| Q3 | Does any Hubble workload use PVCs, or is all state in Aurora? | Platform / squads |
| Q4 | Which services should use the Aurora reader endpoint (recon only?) | DBA / squads |
| Q5 | Can the DBA provide a SIT test user with DML on reset tables only? | DBA |
| Q6 | Is Daytona (qfixflyer221 / qtxfly201) the FIX participant simulator for Signal B, and which environments can SIT use? | Architecture |
| Q9 | Which Signal B participants and entitlements exist in SIT, and who owns their ForgeRock test credentials? | Signal B team |
| Q10 | Is the Signal B test suite in the same repo and runner as hubble-e2e-test? | Signal B team |
| Q7 | What is the parity window and comparison scope for AWS vs on-prem (products, days, tolerances)? | Migration lead |
| Q8 | Does SLFT already cover the rule matrices (TAS criteria, valuation rules)? If not, these are SLFT gaps. | Squad leads |

---

## 19. Roadmap

| Phase | Delivers | Gate switched on |
|---|---|---|
| Phase 0 · sprint 1 | Answer Q1–Q5; SLFT/SIT split per requirement; Postgres support; cluster validation adapted for Hubble; Aurora roles and schema checks; tag lint and RTM | G0, G1 (report-only) |
| Phase 1 · sprints 2–4 | Restore the Signal B poison assertion; add Signal B E2E and a HUBDAM pack to scheduled CI; L1 network/TLS/identity; L2 Aurora persistence (#21–#29), SOD, quote → valuation, trade → TAS, date roll; manual tests moved to CI | G1 blocking, G2 |
| Phase 2 · sprints 5–7 | L2 platform events (#32–#37), ingestion and files; L3 delivery failure, product = database, D04/E03/CS-BT gaps, Signal B network path, lifecycle, recovery, trade corrections and traceability | G3 blocking |
| Phase 3 · sprint 8+ | Blue/green cutover, migration parity and data integrity, multi-day overnight, traceability, SPT/OAT hand-off evidence | G4 |

---

## 20. References

- Hubble AWS – Dev (EKS cluster, node groups, Aurora specs, S3, certificates, network firewalls)
- Hubble AWS – Migration Plan
- Hubble_Aurora_Design.xlsx (DB users, per-service databases and tables)
- Service Resource Limits: https://asxo.atlassian.net/wiki/spaces/1CRDR/pages/1338021252/Service+Resource+Limits
- Hubble to Daytona Connectivity: https://asxo.atlassian.net/wiki/spaces/1CRDR/pages/1337858778/Hubble+to+Daytona+Connectivity
- AWS EKS Cluster access: https://asxo.atlassian.net/wiki/spaces/CV/pages/1123454742/AWS+EKS+Cluster+access
- Enterprise Kafka AWS cluster validation script (ent-kafka-nft-green report, 7 Aug 2026: 73/73 passed), reused for features #5, #6, #37 and #61 (section 8.1)
- hubble-e2e-test Cucumber framework (feature map, ~93 features)
