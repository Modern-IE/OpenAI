# OpenAI JavaScript SDK for IE6

The official-like `openai` standard API, fully backward compatible with Internet Explorer 6.

Because AI doesn't need Chrome 120. It just needs `ActiveXObject("Microsoft.XMLHTTP")` and some retro-engineering.

## Hidden Dark Arts inside
1. ES3 JSON Serializer: IE6 doesn't have `JSON.stringify`. This script dynamically serializes your JavaScript payload into strict JSON format.
2. Micro-Promise Engine: IE6 doesn't know what `.then()` is. We built a minimal Promise-like chain handler to simulate asynchronous resolution gracefully.
3. `eval()` Deserialization: Uses pure ES3 `eval()` (with parenthesis encapsulation) to parse the JSON response from OpenAI since `JSON.parse` doesn't exist.

## Note on HTTPS
*IE6 only natively supports SSL 3.0 / TLS 1.0. OpenAI's API requires TLS 1.2+. To use this script directly on IE6, you must pass a proxy `baseURL` in the config that runs on pure HTTP or older HTTPS.*

## Usage

```JavaScript
var client = new OpenAI({
    apiKey: 'sk-xxxxxxxxxxxxxxxxx',
    dangerouslyAllowBrowser: true
});

client.chat.completions.create({
    model: "gpt-5",
    messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello from IE6!" }
    ],
    temperature: 0.7
}).then(function(response) {
    alert("Response: " + response.choices[0].message.content);
})['catch'](function(error) {
    alert("Error: " + error.message);
});

client.models.list().then(function(res) {
    var modelIds = [];
    for(var i=0; i < res.data.length; i++) {
        modelIds.push(res.data[i].id);
    }
    alert("Models: " + modelIds.join(", "));
})['catch'](function(err) {
    alert("Model fetch failed: " + err.message);
});
```
