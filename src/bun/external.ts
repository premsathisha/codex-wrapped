const resolveAllowedExternalHosts = (): Set<string> => {
  const hosts = new Set([
    "127.0.0.1",
    "localhost",
  ]);

  const configuredBaseUrl =
    process.env.AI_WRAPPED_SHARE_BASE_URL ?? process.env.VITE_SHARE_BASE_URL ?? "";
  if (configuredBaseUrl.trim().length > 0) {
    try {
      hosts.add(new URL(configuredBaseUrl).hostname.toLowerCase());
    } catch {
      // Ignore invalid configured URLs.
    }
  }

  return hosts;
};

export const tryResolveAllowedExternalUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const protocolAllowed = parsed.protocol === "https:" || parsed.protocol === "http:";
    const hostAllowed = resolveAllowedExternalHosts().has(parsed.hostname.toLowerCase());
    const hasCredentials = parsed.username.length > 0 || parsed.password.length > 0;
    if (!protocolAllowed || !hostAllowed || hasCredentials) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
};

export const getOpenExternalCommand = (
  url: string,
  platform: NodeJS.Platform = process.platform,
): string[] => {
  if (platform === "darwin") {
    return ["open", url];
  }

  if (platform === "win32") {
    // Avoid shell-based invocations to reduce command-injection risk.
    return ["rundll32.exe", "url.dll,FileProtocolHandler", url];
  }

  return ["xdg-open", url];
};
