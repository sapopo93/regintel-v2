# Feature Map

Source of truth for UI routes and API endpoints. Update this file when navigation, routes, or API client calls change.

<!-- feature-map:begin -->
```json
{
  "routes": [
    {
      "route": "/",
      "status": "LIVE",
      "endpoints": []
    },
    {
      "route": "/login",
      "status": "LIVE",
      "endpoints": []
    },
    {
      "route": "/sign-in/[[...sign-in]]",
      "status": "LIVE",
      "endpoints": []
    },
    {
      "route": "/sign-up/[[...sign-up]]",
      "status": "LIVE",
      "endpoints": []
    },
    {
      "route": "/terms",
      "status": "LIVE",
      "endpoints": []
    },
    {
      "route": "/privacy",
      "status": "LIVE",
      "endpoints": []
    },
    {
      "route": "/providers",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers",
        "POST /v1/providers"
      ]
    },
    {
      "route": "/facilities?provider=:providerId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/facilities"
      ]
    },
    {
      "route": "/facilities/new?provider=:providerId",
      "status": "LIVE",
      "endpoints": [
        "POST /v1/facilities/onboard",
        "POST /v1/providers/:providerId/facilities"
      ]
    },
    {
      "route": "/facilities/[facilityId]?provider=:providerId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/facilities/:facilityId",
        "GET /v1/facilities/:facilityId/evidence",
        "POST /v1/evidence/blobs",
        "POST /v1/facilities/:facilityId/evidence"
      ]
    },
    {
      "route": "/overview?provider=:providerId&facility=:facilityId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/overview?facility=:facilityId"
      ]
    },
    {
      "route": "/topics?provider=:providerId&facility=:facilityId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/topics?facility=:facilityId"
      ]
    },
    {
      "route": "/topics/[topicId]?provider=:providerId&facility=:facilityId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/overview?facility=:facilityId",
        "GET /v1/providers/:providerId/topics/:topicId"
      ]
    },
    {
      "route": "/mock-session?provider=:providerId&facility=:facilityId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/overview?facility=:facilityId",
        "GET /v1/providers/:providerId/mock-sessions?facility=:facilityId",
        "GET /v1/providers/:providerId/topics?facility=:facilityId",
        "POST /v1/providers/:providerId/mock-sessions"
      ]
    },
    {
      "route": "/mock-session/[sessionId]?provider=:providerId&facility=:facilityId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/overview?facility=:facilityId",
        "GET /v1/providers/:providerId/mock-sessions/:sessionId?facility=:facilityId",
        "POST /v1/providers/:providerId/mock-sessions/:sessionId/answer"
      ]
    },
    {
      "route": "/findings?provider=:providerId&facility=:facilityId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/overview?facility=:facilityId",
        "GET /v1/providers/:providerId/findings?facility=:facilityId"
      ]
    },
    {
      "route": "/findings/[findingId]?provider=:providerId&facility=:facilityId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/overview?facility=:facilityId",
        "GET /v1/providers/:providerId/findings/:findingId"
      ]
    },
    {
      "route": "/evidence?provider=:providerId&facility=:facilityId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/overview?facility=:facilityId",
        "GET /v1/providers/:providerId/evidence?facility=:facilityId"
      ]
    },
    {
      "route": "/exports?provider=:providerId&facility=:facilityId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/overview?facility=:facilityId",
        "GET /v1/providers/:providerId/exports?facility=:facilityId",
        "POST /v1/providers/:providerId/exports",
        "GET /v1/exports/:exportId.csv",
        "GET /v1/exports/:exportId.pdf"
      ]
    },
    {
      "route": "/audit?provider=:providerId&facility=:facilityId",
      "status": "LIVE",
      "endpoints": [
        "GET /v1/providers/:providerId/overview?facility=:facilityId",
        "GET /v1/providers/:providerId/audit-trail"
      ]
    }
  ],
  "clientEndpoints": [
    "GET /v1/providers",
    "POST /v1/providers",
    "GET /v1/providers/:providerId/overview?facility=:facilityId",
    "GET /v1/providers/:providerId/topics?facility=:facilityId",
    "GET /v1/providers/:providerId/topics/:topicId",
    "GET /v1/providers/:providerId/mock-sessions?facility=:facilityId",
    "POST /v1/providers/:providerId/mock-sessions",
    "GET /v1/providers/:providerId/mock-sessions/:sessionId?facility=:facilityId",
    "POST /v1/providers/:providerId/mock-sessions/:sessionId/answer",
    "GET /v1/providers/:providerId/findings?facility=:facilityId",
    "GET /v1/providers/:providerId/findings/:findingId",
    "GET /v1/providers/:providerId/evidence?facility=:facilityId",
    "GET /v1/providers/:providerId/audit-trail",
    "POST /v1/providers/:providerId/exports",
    "GET /v1/providers/:providerId/exports?facility=:facilityId",
    "POST /v1/providers/:providerId/facilities",
    "GET /v1/providers/:providerId/facilities",
    "GET /v1/facilities",
    "GET /v1/facilities/:facilityId",
    "POST /v1/facilities/onboard",
    "POST /v1/evidence/blobs",
    "POST /v1/facilities/:facilityId/evidence",
    "GET /v1/facilities/:facilityId/evidence",
    "/v1/background-jobs/${jobId}",
    "/v1/evidence/blobs/${blobHash}/scan",
    "/v1/providers/:providerId/mock-sessions/:sessionId/ai-insights",
    "/v1/facilities/:facilityId/sync-latest-report",
    "/v1/facilities/onboard-bulk"
  ]
}
```
<!-- feature-map:end -->
