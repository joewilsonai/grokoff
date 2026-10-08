# Inherited deployment templates

GrokOff currently provides a local Mac edition. The container, Podman, Fly and Cloudflare templates in this source tree are inherited reference material and are not a supported GrokOff hosted service. No service is deployed or operated by this fork.

Before using a template, review it and supply your own account, database, rate-limit namespaces, domain, images, authentication settings and secrets. The Cloudflare configurations deliberately use unconfigured identifiers; replace them in a private deployment configuration before validation or deployment. The example domains do not resolve. Public worker routing, new broker registrations, automatic cleanup schedules and active tunnel reclaim are disabled in these templates.

Do not run inherited deploy or release scripts against upstream services. Some other inherited documentation and templates retain historical upstream image names or service links; review those explicitly before use. Local GrokOff does not automatically provision a hosted control plane or broker. Keep secrets out of committed configuration.
