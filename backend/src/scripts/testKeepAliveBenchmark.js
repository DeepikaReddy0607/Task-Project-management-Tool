import http from "node:http";

const agent = new http.Agent({
    keepAlive: true,
    maxSockets: 1000,
    keepAliveMsecs: 30000
});

export function httpRequest(urlStr, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const reqOptions = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: options.method || "GET",
            headers: options.headers || {},
            agent,
            timeout: 12000
        };

        const req = http.request(reqOptions, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                resolve({
                    status: res.statusCode,
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    text: async () => data,
                    json: async () => JSON.parse(data)
                });
            });
        });

        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy(new Error("Request timed out"));
        });

        if (options.body) {
            req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
        }
        req.end();
    });
}

console.log("httpRequest helper created with persistent keepAlive Agent");
