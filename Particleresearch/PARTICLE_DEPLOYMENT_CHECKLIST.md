# Particle Network - Production Deployment Checklist

**Complete checklist for launching to production**

---

## Pre-Deployment Checklist

### 1. Particle Network Configuration

- [ ] **Production Project Created**
  - Created separate Particle project for production
  - Project name clearly indicates "Production"
  - All required chains added to project

- [ ] **Credentials Secured**
  - Production credentials stored in environment vault (not in code)
  - `.env` file added to `.gitignore`
  - `.env.example` template created without real values
  - Team members know where to find credentials

- [ ] **Chains Configured**
  - All required chains added in Particle Dashboard
  - Chain RPC URLs verified working
  - Block explorers configured correctly
  - Test transactions successful on all chains

### 2. Environment Variables

**Verify all required variables set in production environment:**

```bash
# Production Environment (Vercel/Netlify/etc.)
✓ REACT_APP_PARTICLE_PROJECT_ID      # Production project ID
✓ REACT_APP_PARTICLE_CLIENT_KEY      # Production client key
✓ REACT_APP_PARTICLE_APP_ID          # Production app ID
✓ REACT_APP_TX_EXECUTOR               # "ua" or "eoa"
✓ REACT_APP_ENABLE_WEB3               # "true" or "false"
✓ REACT_APP_WALLETCONNECT_ID         # Production WalletConnect ID (if used)
✓ NODE_ENV                            # "production"
```

- [ ] All variables verified in production hosting platform
- [ ] No hardcoded credentials in source code
- [ ] Environment variables match production Particle project
- [ ] Test environment uses separate Particle project

### 3. Code Quality

- [ ] **TypeScript Compilation**
  - No TypeScript errors: `npm run build` succeeds
  - Strict mode enabled
  - All types properly defined

- [ ] **Linting**
  - ESLint passes: `npm run lint`
  - No critical warnings
  - Code formatting consistent

- [ ] **Bundle Size**
  - Production build analyzed
  - Bundle size < 500KB (gzipped) for main chunk
  - Code splitting implemented
  - Lazy loading for large dependencies

- [ ] **Dependencies**
  - All dependencies up to date
  - No known security vulnerabilities: `npm audit`
  - Unused dependencies removed
  - Particle Network versions match guide

### 4. Testing

#### Unit Tests
- [ ] Login flow tested
- [ ] Logout flow tested
- [ ] Balance display tested
- [ ] Transaction sending tested
- [ ] Error handling tested
- [ ] All tests pass: `npm test`

#### Integration Tests
- [ ] Email login works end-to-end
- [ ] Google login works end-to-end
- [ ] MetaMask connection works
- [ ] WalletConnect works (if enabled)
- [ ] Phantom wallet works (if Solana supported)
- [ ] Session persistence works (page reload)
- [ ] Logout clears state completely

#### Browser Testing
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

#### Device Testing
- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (iPad)
- [ ] Mobile (iPhone, Android)

#### Network Testing
- [ ] Works on fast connection
- [ ] Works on slow 3G
- [ ] Handles network interruption
- [ ] Retry logic works

### 5. Security

- [ ] **Environment Security**
  - No secrets in source code
  - No secrets in version control
  - Production credentials stored securely
  - Access to credentials restricted to team

- [ ] **HTTPS**
  - Production domain uses HTTPS
  - Certificate valid and not expiring soon
  - HTTP redirects to HTTPS
  - No mixed content warnings

- [ ] **Content Security Policy**
  - CSP headers configured
  - Particle Network domains whitelisted
  - No unsafe-inline or unsafe-eval (if possible)
  - Report-only mode tested first

- [ ] **Input Validation**
  - All wallet addresses validated
  - Transaction amounts validated
  - Maximum limits enforced
  - Negative values rejected

- [ ] **Transaction Security**
  - User confirmation required for all transactions
  - Transaction details displayed clearly
  - Gas limits set appropriately
  - Maximum transaction amount enforced

- [ ] **Error Handling**
  - Sensitive errors not exposed to user
  - Error logging to secure backend
  - Stack traces hidden in production
  - User-friendly error messages

### 6. Performance

- [ ] **Load Time**
  - Initial load < 3 seconds
  - Time to interactive < 5 seconds
  - First contentful paint < 1.5 seconds
  - Lighthouse score > 90

- [ ] **Runtime Performance**
  - No memory leaks
  - No excessive re-renders
  - Efficient state management
  - Debounced API calls

- [ ] **Asset Optimization**
  - Images compressed
  - Fonts optimized
  - Code minified
  - Gzip compression enabled

- [ ] **Caching**
  - Static assets cached
  - API responses cached (where appropriate)
  - Service worker configured (if applicable)
  - CDN configured for static files

### 7. Monitoring & Analytics

- [ ] **Error Tracking**
  - Sentry (or similar) configured
  - Source maps uploaded
  - Error notifications configured
  - Error categorization set up

- [ ] **Analytics**
  - Google Analytics configured
  - Custom events tracked:
    - User login
    - User logout
    - Transaction sent
    - Transaction failed
    - Balance checked
  - Conversion funnels defined

- [ ] **Performance Monitoring**
  - Web Vitals tracked
  - API response times monitored
  - Transaction success rate tracked
  - User session duration tracked

- [ ] **Logging**
  - Production logs collected
  - Log levels configured correctly
  - Sensitive data excluded from logs
  - Log retention policy defined

### 8. User Experience

- [ ] **Onboarding**
  - Clear login instructions
  - First-time user guidance
  - Wallet connection help
  - Error recovery instructions

- [ ] **Loading States**
  - Loading indicators for all async operations
  - Skeleton screens where appropriate
  - Progress indicators for transactions
  - Clear status messages

- [ ] **Error States**
  - User-friendly error messages
  - Recovery actions suggested
  - Help documentation linked
  - Support contact available

- [ ] **Empty States**
  - Clear messaging for empty wallets
  - Guidance for next steps
  - Call-to-action buttons
  - Educational content

### 9. Documentation

- [ ] **User Documentation**
  - Login guide
  - Transaction guide
  - Troubleshooting guide
  - FAQ section

- [ ] **Developer Documentation**
  - Architecture overview
  - API documentation
  - Deployment guide
  - Troubleshooting guide

- [ ] **Internal Documentation**
  - Environment setup guide
  - Credential access guide
  - Deployment process
  - Rollback procedure

### 10. Legal & Compliance

- [ ] **Privacy Policy**
  - Privacy policy created
  - Covers Particle Network usage
  - GDPR compliant (if applicable)
  - User consent obtained

- [ ] **Terms of Service**
  - Terms of service created
  - Covers wallet usage
  - Disclaimer for blockchain transactions
  - User agreement obtained

- [ ] **Cookie Policy**
  - Cookie notice displayed
  - Cookie preferences manageable
  - Third-party cookies disclosed

---

## Deployment Day Checklist

### Pre-Deployment (1 hour before)

- [ ] **Final Verification**
  - [ ] All production credentials verified
  - [ ] Production build tested locally
  - [ ] Staging environment fully tested
  - [ ] Team notified of deployment window

- [ ] **Rollback Plan**
  - [ ] Previous version tagged in git
  - [ ] Rollback procedure documented
  - [ ] Team knows how to rollback
  - [ ] Rollback tested in staging

### Deployment

- [ ] **Build & Deploy**
  - [ ] Production build created: `npm run build`
  - [ ] Build artifacts verified
  - [ ] Deploy to hosting platform
  - [ ] Deployment successful

- [ ] **Post-Deployment Verification**
  - [ ] Production site loads
  - [ ] Login works
  - [ ] No console errors
  - [ ] Analytics tracking
  - [ ] Error monitoring active

### Post-Deployment (First 24 hours)

- [ ] **Monitoring**
  - [ ] Check error rates (should be low)
  - [ ] Check response times (should be fast)
  - [ ] Check login success rate (should be high)
  - [ ] Check transaction success rate

- [ ] **User Feedback**
  - [ ] Monitor support channels
  - [ ] Collect user feedback
  - [ ] Address critical issues immediately
  - [ ] Document common issues

---

## Production Environment Setup

### Recommended Hosting Platforms

**Vercel (Recommended for Next.js/React):**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
# Settings → Environment Variables
```

**Netlify:**
```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod

# Set environment variables in Netlify dashboard
# Site settings → Build & deploy → Environment
```

**AWS Amplify:**
- Connect GitHub repository
- Configure build settings
- Add environment variables
- Deploy

### Environment Variable Configuration

**Vercel:**
1. Dashboard → Project → Settings → Environment Variables
2. Add each variable:
   - Name: `REACT_APP_PARTICLE_PROJECT_ID`
   - Value: `your-production-value`
   - Environments: Production ✓
3. Redeploy

**Netlify:**
1. Site settings → Build & deploy → Environment
2. Add each variable
3. Trigger redeploy

### Domain Configuration

- [ ] Custom domain configured
- [ ] DNS records updated
- [ ] SSL certificate active
- [ ] WWW redirect configured
- [ ] Domain verified

---

## Performance Benchmarks

### Target Metrics (Production)

| Metric | Target | Acceptable | Critical |
|--------|--------|------------|----------|
| Initial Load Time | < 2s | < 3s | > 5s |
| Time to Interactive | < 3s | < 5s | > 7s |
| Login Success Rate | > 95% | > 90% | < 85% |
| Transaction Success | > 98% | > 95% | < 90% |
| Error Rate | < 1% | < 3% | > 5% |
| API Response Time | < 500ms | < 1s | > 2s |
| Uptime | > 99.9% | > 99% | < 98% |

### Monitoring Dashboards

Create dashboards to track:
- Real-time active users
- Login success/failure rate
- Transaction volume
- Error rates by type
- API response times
- Browser/device distribution

---

## Rollback Procedure

If critical issues detected:

1. **Immediate Actions:**
   ```bash
   # Revert to previous deployment
   vercel rollback  # or
   netlify rollback
   ```

2. **Verify Rollback:**
   - [ ] Site loads correctly
   - [ ] Login works
   - [ ] No new errors
   - [ ] Analytics confirms rollback

3. **Communicate:**
   - [ ] Notify team
   - [ ] Update status page
   - [ ] Inform users (if needed)

4. **Post-Mortem:**
   - [ ] Document what went wrong
   - [ ] Identify root cause
   - [ ] Create action items
   - [ ] Test fix in staging

---

## Support Readiness

### Before Launch

- [ ] **Support Documentation**
  - Common issues documented
  - Solutions prepared
  - Escalation path defined

- [ ] **Support Team Training**
  - Team trained on Particle Network
  - Common issues reviewed
  - Escalation process clear

- [ ] **Support Channels**
  - Email support configured
  - Live chat ready (if applicable)
  - Phone support ready (if applicable)
  - Response time SLA defined

### After Launch

- [ ] Monitor support tickets
- [ ] Document new issues
- [ ] Update FAQ regularly
- [ ] Track common problems

---

## Success Criteria

**Launch considered successful if:**

- ✅ 95%+ login success rate
- ✅ < 1% error rate
- ✅ < 3s average load time
- ✅ No critical bugs in first 24 hours
- ✅ Positive user feedback
- ✅ All core features working

**If criteria not met:**
- Investigate issues immediately
- Consider rollback if critical
- Deploy hotfix if possible
- Communicate with users

---

## Post-Launch (First Week)

### Daily Tasks
- [ ] Check error dashboard
- [ ] Review support tickets
- [ ] Monitor performance metrics
- [ ] Check user feedback
- [ ] Update documentation

### Weekly Tasks
- [ ] Performance review
- [ ] User feedback analysis
- [ ] Bug prioritization
- [ ] Feature requests review
- [ ] Documentation updates

---

## Emergency Contacts

**Internal Team:**
- Engineering Lead: [contact]
- DevOps: [contact]
- Product Manager: [contact]

**External Support:**
- Particle Network Support: support@particle.network
- Particle Network Discord: https://discord.gg/particle-network
- Hosting Support: [platform support]

---

## Final Checklist Summary

Before clicking "Deploy":

- [ ] All tests passing ✅
- [ ] Production credentials set ✅
- [ ] Performance benchmarks met ✅
- [ ] Security audit completed ✅
- [ ] Documentation complete ✅
- [ ] Monitoring configured ✅
- [ ] Team ready for support ✅
- [ ] Rollback plan ready ✅
- [ ] Legal requirements met ✅
- [ ] User communications prepared ✅

**When all checked → Deploy! 🚀**

---

**Document Version:** 1.0  
**Last Updated:** December 5, 2025  
**Owner:** Engineering Team
