# End of life

PC2 / Elacity Node is no longer maintained by Elacity, and this repository is archived (read-only).

v1.4.5 (and earlier) has a known, unfixed weakness in the wallet sign-in. The SIWE login does not check that the signed message is the challenge the node issued, so a previously captured signature from a wallet can be replayed to log in as that wallet, and an unowned node can be claimed.

This will not be patched because the project is end of life. Operators should stop running PC2 / Elacity Node and move to ElastOS v2:

- Release: https://github.com/elastos/elastos-runtime/releases/tag/v2.0.0
- Repository: https://github.com/elastos/elastos-runtime

Credit: reported by independent researcher [kta1kri](https://github.com/kta1kri).

---

# Puter Security Policy

Thank you for helping make Puter safe. Keeping user information safe and secure is a top priority, and we welcome the contribution of external security researchers.

<br>

# Scope

If you believe you've found a security issue in software that is maintained in this repository, we encourage you to notify us.

<br>

# How to Submit a Report

To submit a vulnerability report, please contact us at security@puter.com. Your submission will be reviewed and validated by a member of our team.

> [!WARNING]  
> Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.

<br>

# Safe Harbor

We support safe harbor for security researchers who:

* Make a good faith effort to avoid privacy violations, destruction of data, and interruption or degradation of our services.
* Only interact with accounts you own or with explicit permission of the account holder. If you do encounter Personally Identifiable Information (PII) contact us immediately, do not proceed with access, and immediately purge any local information.
* Provide us with a reasonable amount of time to resolve vulnerabilities prior to any disclosure to the public or a third-party.

We will consider activities conducted consistent with this policy to constitute "authorized" conduct and will not pursue civil action or initiate a complaint to law enforcement. We will help to the extent we can if legal action is initiated by a third party against you.

Please submit a report to us before engaging in conduct that may be inconsistent with or unaddressed by this policy.

<br>

# Preferences

* Please provide detailed reports with reproducible steps and a clearly defined impact.
* Include the version number of the vulnerable package in your report
* Social engineering (e.g. phishing, vishing, smishing) is prohibited.
