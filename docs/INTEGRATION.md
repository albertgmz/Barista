# Barista Integration API

The integration server is disabled by default. Enable it under **Preferences ▸ Integration** and
generate a token with the smallest required scopes. It binds to `127.0.0.1:17777` by default. LAN
binding requires an explicit acknowledgement, firewall planning and trusted network controls.

Send tokens as `Authorization: Bearer TOKEN`. Browser origins are rejected unless their exact
origin is allowlisted. A token is shown only once; Barista stores its SHA-256 digest. Requests are
rate-limited, size-limited, timed out and audit-logged. Uploaded archives use the normal schema and
preflight path and additionally reject unsafe paths, symlinks, more than 1,000 entries, more than
100 MB expanded data, entries over 20 MB and suspicious compression ratios.

## Examples

```bash
curl -H "Authorization: Bearer $BARISTA_TOKEN" http://127.0.0.1:17777/v1/status
curl -H "Authorization: Bearer $BARISTA_TOKEN" -H "Content-Type: application/json" \
  -d '{"templateId":"LIBRARY_ID","values":{"operator":"Ada"},"format":"png"}' \
  http://127.0.0.1:17777/v1/preview --output preview.png
curl -H "Authorization: Bearer $BARISTA_TOKEN" \
  -F 'file=@equipment.bar;type=application/octet-stream' \
  -F 'options={"printer":"Microsoft Print to PDF","copies":1};type=application/json' \
  http://127.0.0.1:17777/v1/print/bar
```

```php
<?php
$token = getenv('BARISTA_TOKEN');
$options = json_encode(['printer' => 'Microsoft Print to PDF', 'copies' => 1]);
$curl = curl_init('http://127.0.0.1:17777/v1/print/bar');
curl_setopt_array($curl, [
  CURLOPT_HTTPHEADER => ["Authorization: Bearer $token"],
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => [
    'file' => new CURLFile(__DIR__ . '/equipment.bar', 'application/octet-stream'),
    'options' => $options,
  ],
  CURLOPT_RETURNTRANSFER => true,
]);
echo curl_exec($curl);
```

```js
const form = new FormData()
form.append('file', new Blob([await (await fetch('equipment.bar')).arrayBuffer()]), 'equipment.bar')
form.append('options', JSON.stringify({ format: 'png', values: { operator: 'Ada' } }))
const preview = await fetch('http://127.0.0.1:17777/v1/preview/bar', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form
})
document.querySelector('img').src = URL.createObjectURL(await preview.blob())

const events = new WebSocket('ws://127.0.0.1:17777/v1/events', [
  'barista-v1',
  `barista-token.${token}`
])
events.onmessage = ({ data }) => console.log(JSON.parse(data))
```

## OpenAPI 3.0

```yaml
openapi: 3.0.3
info:
  title: Barista Integration API
  version: 1.0.0
servers:
  - url: http://127.0.0.1:17777
security:
  - bearerAuth: []
paths:
  /v1/status:
    get:
      summary: Server status
      responses: { '200': { description: Status } }
  /v1/printers:
    get:
      summary: Installed printers
      responses: { '200': { description: Printer list } }
  /v1/templates:
    get:
      summary: Approved library templates
      responses: { '200': { description: Template list } }
  /v1/preview:
    post:
      summary: Preview a library template
      requestBody:
        {
          required: true,
          content: { application/json: { schema: { $ref: '#/components/schemas/Job' } } }
        }
      responses: { '200': { description: PNG or PDF }, '422': { description: Preflight failed } }
  /v1/print:
    post:
      summary: Print a library template
      requestBody:
        {
          required: true,
          content: { application/json: { schema: { $ref: '#/components/schemas/Job' } } }
        }
      responses: { '202': { description: Job accepted }, '422': { description: Preflight failed } }
  /v1/preview/bar:
    post:
      summary: Preview an uploaded data-only .bar file
      requestBody: { $ref: '#/components/requestBodies/BarUpload' }
      responses: { '200': { description: PNG or PDF }, '422': { description: Preflight failed } }
  /v1/print/bar:
    post:
      summary: Print an uploaded data-only .bar file
      requestBody: { $ref: '#/components/requestBodies/BarUpload' }
      responses: { '202': { description: Job accepted }, '422': { description: Preflight failed } }
  /v1/jobs/{id}:
    get:
      summary: Job progress
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses: { '200': { description: Job }, '404': { description: Unknown job } }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
  schemas:
    Job:
      type: object
      properties:
        templateId: { type: string }
        values: { type: object, additionalProperties: { type: string } }
        records: { type: array, items: { type: object } }
        printer: { type: string }
        copies: { type: integer, minimum: 1, maximum: 9999, default: 1 }
        serializedCount: { type: integer, minimum: 1, maximum: 100000, default: 1 }
        format: { type: string, enum: [png, pdf], default: png }
  requestBodies:
    BarUpload:
      required: true
      content:
        multipart/form-data:
          schema:
            type: object
            required: [file, options]
            properties:
              file: { type: string, format: binary }
              options: { type: string, description: JSON encoded Job options }
```

WebSocket job events are available at `/v1/events`. Native WebSocket clients may use the
`Authorization` header; browser clients offer `barista-v1` and `barista-token.TOKEN` as
subprotocols. The server selects only `barista-v1`, so the secret is not echoed in the handshake.
Compression is
disabled and inbound frames are limited to 16 KiB.
