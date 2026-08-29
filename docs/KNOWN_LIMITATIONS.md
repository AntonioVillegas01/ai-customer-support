# Known limitations

- The current API exposes no staff AI suggestion or conversation summary routes, so the dashboard renders explicit unavailable states instead of mock AI output.
- The current API exposes no member invitation, member role update, organization update, widget list/update, allowed-origin management, or usage-summary routes. Related settings and analytics panels avoid hardcoded data and show unavailable/restricted states where no real endpoint exists.
- The staff conversation list endpoint currently ignores search, status, and unassigned filters; the web client sends supported-safe query parameters but relies on the API to enforce tenant scope and filtering when those routes are extended.
