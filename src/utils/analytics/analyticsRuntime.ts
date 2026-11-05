// entry 靜態引用的 analytics 單例：把 createAnalytics 接上真實環境。

export function startAnalytics(): void {}
export function trackPageview(_pathname: string): void {}
export function resetAnalytics(): void {}
