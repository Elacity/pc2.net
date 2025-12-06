import{i as x,u as P}from"./chunk-O2UGP222-CmEAhJlC.js";import{i as d,b as i}from"./chunk-G4I34CN4-BNmycLjj.js";import{i as k,P as h}from"./chunk-QH6JFFQS-B5ZsNHko.js";import{_ as r,z as _,g as f,B as W,C as v,h as j,u as b,D as C,E as R,n as s,P as w,v as n,F as T,G as F}from"./index-C5hWklah.js";import"./chunk-EK3VN6OT-CLVErbzn.js";var l,c,L=r({"src/pages/loginPasskey/styles.ts"(){l=n.div`
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
`}}),o,E,I=r({"src/pages/loginPasskey/index.tsx"(){_(),d(),k(),x(),f(),W(),v(),j(),L(),o=()=>{const e=b(),{navigate:p}=C(),u=P(),t=R("passkeySmartWallet"),g=()=>{T()?(p("passkey-setup"),F()):a(!0)},m=()=>{a(!1)},a=y=>{if(t)u(t,{passkeyParams:{isRegistering:y}});else throw new Error("Passkey is not configured.")};return s.jsxs(h,{children:[s.jsx(l,{children:s.jsx(w,{})}),s.jsx(c,{children:e.usePasskeyToLoginSmartAccount}),s.jsxs(s.Fragment,{children:[s.jsx(i,{style:{marginTop:16},onClick:g,children:e.createNewPasskey}),s.jsx(i,{style:{marginTop:16},onClick:m,color:"secondary",children:e.loginWithPasskey})]})]})},E=o}});I();export{E as default};
