import{i as x,u as k}from"./chunk-O2UGP222-ByZsFN-v.js";import{i as P,b as i}from"./chunk-G4I34CN4-CTWYASm4.js";import{i as d,P as f}from"./chunk-QH6JFFQS-BG0WWyRr.js";import{f as r,X as h,q as _,u as W,Y as j,L as v,v as b,E as R,Z as w,j as s,$ as C,G as n,a0 as L,a1 as T}from"./index-DWEcBvd3.js";import"./chunk-EK3VN6OT-CCa8Z1P4.js";var l,c,E=r({"src/pages/loginPasskey/styles.ts"(){l=n.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  margin: 30px 0;
  margin-bottom: 20px;
  color: var(--pcm-accent-color);
`,c=n.div`
  text-align: center;
  font-size: 14px;
  color: var(--pcm-body-color);
  margin-top: 16px;
  margin-bottom: 40px;
`}}),o,F,I=r({"src/pages/loginPasskey/index.tsx"(){h(),P(),d(),x(),_(),W(),j(),v(),E(),o=()=>{const e=b(),{navigate:p}=R(),u=k(),t=w("passkeySmartWallet"),m=()=>{L()?(p("passkey-setup"),T()):a(!0)},y=()=>{a(!1)},a=g=>{if(t)u(t,{passkeyParams:{isRegistering:g}});else throw new Error("Passkey is not configured.")};return s.jsxs(f,{children:[s.jsx(l,{children:s.jsx(C,{})}),s.jsx(c,{children:e.usePasskeyToLoginSmartAccount}),s.jsxs(s.Fragment,{children:[s.jsx(i,{style:{marginTop:16},onClick:m,children:e.createNewPasskey}),s.jsx(i,{style:{marginTop:16},onClick:y,color:"secondary",children:e.loginWithPasskey})]})]})},F=o}});I();export{F as default};
