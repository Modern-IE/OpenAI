(function(global) {
    var JSON_ES3 = {
        stringify: function(v) {
            if (v === null) return 'null';
            if (v === undefined) return undefined;
            if (typeof v === 'string') {
                var escapeMap = {'"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t'};
                return '"' + v.replace(/[\\"\u0000-\u001F]/g, function(a) {
                    var c = escapeMap[a];
                    if (c) return c;
                    c = a.charCodeAt(0).toString(16);
                    return '\\u00' + (c.length === 1 ? '0' + c : c);
                }) + '"';
            }
            if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
            if (typeof v === 'boolean') return String(v);
            if (v instanceof Array) {
                var res = [];
                for (var i = 0; i < v.length; i++) {
                    var val = JSON_ES3.stringify(v[i]);
                    res.push(val === undefined ? 'null' : val);
                }
                return '[' + res.join(',') + ']';
            }
            if (typeof v === 'object') {
                var res2 = [];
                for (var k in v) {
                    if (Object.prototype.hasOwnProperty.call(v, k)) {
                        var val2 = JSON_ES3.stringify(v[k]);
                        if (val2 !== undefined) res2.push('"' + k + '":' + val2);
                    }
                }
                return '{' + res2.join(',') + '}';
            }
        },
        parse: function(text) {
            try {
                return eval('(' + text + ')');
            } catch (e) {
                throw new Error("JSON Parse error");
            }
        }
    };

    function PromiseES3(fn) {
        var state = 0; // 0: pending, 1: fulfilled, 2: rejected
        var value;
        var deferreds = [];

        function handle(deferred) {
            if (state === 0) {
                deferreds.push(deferred);
                return;
            }
            setTimeout(function() {
                var cb = state === 1 ? deferred.onFulfilled : deferred.onRejected;
                if (cb === null) {
                    (state === 1 ? deferred.resolve : deferred.reject)(value);
                    return;
                }
                var ret;
                try {
                    ret = cb(value);
                } catch (e) {
                    deferred.reject(e);
                    return;
                }
                deferred.resolve(ret);
            }, 0);
        }

        this.then = function(onFulfilled, onRejected) {
            return new PromiseES3(function(resolve, reject) {
                handle({
                    onFulfilled: typeof onFulfilled === 'function' ? onFulfilled : null,
                    onRejected: typeof onRejected === 'function' ? onRejected : null,
                    resolve: resolve,
                    reject: reject
                });
            });
        };
        
        this['catch'] = function(onRejected) {
            return this.then(null, onRejected);
        };

        function resolve(newValue) {
            if (newValue && typeof newValue.then === 'function') {
                newValue.then(resolve, reject);
                return;
            }
            state = 1; value = newValue;
            for (var i = 0; i < deferreds.length; i++) handle(deferreds[i]);
            deferreds = [];
        }

        function reject(reason) {
            state = 2; value = reason;
            for (var i = 0; i < deferreds.length; i++) handle(deferreds[i]);
            deferreds = [];
        }

        try { fn(resolve, reject); } catch (e) { reject(e); }
    }

    function OpenAIError(message) {
        this.name = 'OpenAIError';
        this.message = message;
    }
    OpenAIError.prototype = new Error();

    function APIError(status, errorData, message) {
        this.name = 'APIError';
        this.status = status;
        this.error = errorData;
        this.message = message || (errorData && errorData.message ? errorData.message : 'API Error');
    }
    APIError.prototype = new OpenAIError();

    function OpenAI(cfg) {
        cfg = cfg || {};
        
        if (!cfg.dangerouslyAllowBrowser) {
            throw new OpenAIError("It looks like you're running in a browser-like environment. This is disabled by default. Set dangerouslyAllowBrowser: true to override.");
        }

        this.apiKey = cfg.apiKey || '';
        this.baseURL = (cfg.baseURL || "https://api.openai.com/v1").replace(/\/$/, "");
        this.organization = cfg.organization || null;
        this.project = cfg.project || null;
        this.timeout = cfg.timeout || 10 * 60 * 1000;

        var self = this;

        function request(method, path, body) {
            if (body && body.stream) {
                return new PromiseES3(function(_, reject) {
                    reject(new OpenAIError("Streaming is strictly not supported in IE6 due to XMLHttpRequest limitations. Please set stream: false."));
                });
            }

            return new PromiseES3(function(resolve, reject) {
                var xhr = global.ActiveXObject ? new ActiveXObject("Microsoft.XMLHTTP") : new XMLHttpRequest();
                var url = self.baseURL + path;
                var isTimeout = false;

                xhr.open(method, url, true);
                xhr.setRequestHeader("Accept", "application/json");
                xhr.setRequestHeader("Content-Type", "application/json");
                xhr.setRequestHeader("Authorization", "Bearer " + self.apiKey);
                
                if (self.organization) xhr.setRequestHeader("OpenAI-Organization", self.organization);
                if (self.project) xhr.setRequestHeader("OpenAI-Project", self.project);

                var timer = setTimeout(function() {
                    isTimeout = true;
                    xhr.abort();
                    reject(new OpenAIError("Request timed out after " + self.timeout + "ms"));
                }, self.timeout);

                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4 && !isTimeout) {
                        clearTimeout(timer);
                        var status = xhr.status;
                        var responseText = xhr.responseText;
                        var responseJson = null;

                        try {
                            if (responseText) responseJson = JSON_ES3.parse(responseText);
                        } catch (e) {
                            reject(new OpenAIError("Failed to parse response: " + responseText));
                            return;
                        }

                        if (status >= 200 && status < 300) {
                            resolve(responseJson);
                        } else {
                            reject(new APIError(status, responseJson ? responseJson.error : null));
                        }
                    }
                };

                xhr.send(body ? JSON_ES3.stringify(body) : null);
            });
        }

        this.chat = {
            completions: {
                create: function(params) {
                    return request("POST", "/chat/completions", params);
                }
            }
        };

        this.models = {
            list: function() {
                return request("GET", "/models");
            },
            retrieve: function(model) {
                return request("GET", "/models/" + model);
            }
        };

        this.embeddings = {
            create: function(params) {
                return request("POST", "/embeddings", params);
            }
        };

        this.images = {
            generate: function(params) {
                return request("POST", "/images/generations", params);
            }
        };
    }

    global.OpenAI = OpenAI;

})(window);
