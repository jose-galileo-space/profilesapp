# Orbital Stack Design Document
**Version:** 1.0 Alpha
**Date:** February 10, 2026
**Status:** Live / In Development

---

## 1. Executive Summary
Orbital Stack is a satellite intelligence platform that ingests raw imagery, normalizes it, and applies multi-stage AI analysis (Computer Vision + Generative AI) to provide tactical situational awareness. The system is event-driven, utilizing AWS serverless architecture to handle asynchronous processing at scale.

## 2. Current Architecture ("The As-Is")

### 2.1 High-Level Data Flow
`User Upload` $\rightarrow$ `Ingest API` $\rightarrow$ `Raw Storage` $\rightarrow$ `Normalization` $\rightarrow$ `Processed Storage` $\rightarrow$ `AI Enrichment Chain` $\rightarrow$ `Intelligence Dashboard`

### 2.2 Component Breakdown

#### A. Ingestion Layer
* **Entry Point:** `api.galileo-space.com/images` (API Gateway).
* **Compute:** `IngestLambda` (Node.js 20).
* **Function:** Accepts POST requests, writes metadata to DynamoDB (`OrbTable`), and uploads raw binary data to the **Raw Bucket**.
* **Security:** HTTPS via ACM Certificate & Route 53.

#### B. Pre-Processing (The "Cleaning" Crew)
* **Trigger:** S3 Event (Raw Bucket) $\rightarrow$ SNS (`RawImageTopic`) $\rightarrow$ SQS (`ProcessQueue`).
* **Compute:** `CorrectionLambda` (Python 3.11).
* **Function:**
    * Validates image integrity.
    * Normalizes format (converts Tiff/Raw to JPG).
    * Uploads the clean asset to the **Processed Bucket**.

#### C. Analytics Core (The "Enrichment Engine")
* **Trigger:** S3 Event (Processed Bucket) $\rightarrow$ SQS (`AnalyticsQueue`) $\rightarrow$ `AnalyticsTrigger` Lambda.
* **Orchestration:** AWS Step Functions (`OrbitalStateMachine`).
* **Strategy:** **Sequential Data Enrichment**.
    * *Philosophy:* Pre-cursor tasks run first to extract "Hard Features" (bounding boxes, signals). These features are passed to the "Soft Intelligence" layer (LLM) to ground its analysis in measured reality.

    **The Execution Chain:**
    1.  **Step 1: Tactical Extraction (`ObjDetectFunc`):**
        * *Type:* Dockerized Lambda (x86_64).
        * *Model:* Custom YOLO/CV model.
        * *Output:* Identifies vehicles/aircraft and returns bounding boxes to DynamoDB.
    2.  **Step 2: Strategic Synthesis (`GeminiFunc`):**
        * *Type:* Python Lambda.
        * *Model:* Google Gemini 1.5 Flash.
        * *Input:* Receives the image + the bounding boxes from Step 1.
        * *Output:* Generates a **Structured JSON** assessment (Risks, Infrastructure, Anomaly check) to DynamoDB.

#### D. Data Persistence
* **Metadata:** DynamoDB (`OrbTable`).
    * *Partition Key:* `imageId`
    * *Sort Key:* `ownerId`
    * *Indexes:* `OwnerIndex` (query by Owner + Timestamp).
* **Blob Storage:** S3 (Raw & Processed buckets).

#### E. Presentation & API Layer
* **Frontend:** React (Amplify).
* **Backend:** `GetImagesFunc` (Dockerized Python on ARM64).
    * *Access:* Function URL (Public).
    * *Logic:* **Just-In-Time (JIT) Synthesis**.
        1. Fetches the latest 12 images from DynamoDB.
        2. Reads the individual Gemini JSON reports.
        3. Sends the text summaries to a lightweight LLM call to generate a 2-sentence "Mission Briefing" on the fly.
        4. Returns the briefing + image data to the frontend.

---

## 3. Future Roadmap (v2.0)

### 3.1 The "Reports Engine"
**Problem:** The current dashboard is a transient "Session View." Users cannot save findings or curate specific intelligence.
**Solution:** Create a "Report" entity—a container for curated intelligence.

#### User Stories
1.  **Collection:** "As an analyst, I want to select specific images from the dashboard and 'Add to Report' to isolate them."
2.  **Synthesis:** "As an analyst, I want to write a prompt ('Summarize activity changes at Site B') and have the AI generate a report based *only* on the selected evidence."
3.  **Export:** "As an analyst, I want to share this curated report with external stakeholders."

#### Architecture Changes
* **New Data Model:**
    * `Report` Entity (DynamoDB or Aurora Serverless).
    * Relationship: `Report` $\leftrightarrow$ `Images` (Many-to-Many).
* **New API Endpoints:**
    * `POST /reports`: Create container.
    * `POST /reports/{id}/analyze`: Trigger dedicated Gemini analysis on the report context.

### 3.2 Scalability Pattern (Fan-Out/Fan-In)
**Plan:** As we add new sensors (RF Signal Detection, Thermal Analysis), the Step Function will evolve from a linear chain to a **Parallel DAG**.
* **Flow:** `Image` $\rightarrow$ `[Object Detection || RF Analysis || Thermal]` $\rightarrow$ `Wait for All` $\rightarrow$ `Gemini Synthesis`.