import{i as j,c as k}from"./chunk-KFSERCOH-CVMDfFC1.js";import{i as R,u as I}from"./chunk-BSJODNDT-y8nyKIFS.js";import{i as M,C as W}from"./chunk-L7PHO2RG-CfETTcM4.js";import{i as H,b as V}from"./chunk-G4I34CN4-CTWYASm4.js";import{i as E,u as S}from"./chunk-EK3VN6OT-CCa8Z1P4.js";import{i as U,P as D,a as L}from"./chunk-QH6JFFQS-BG0WWyRr.js";import{f as c,j as e,m as r,h as Q,J as Z,q as z,u as A,E as P,v as T,w as q,N as B,D as a,G as s}from"./index-DWEcBvd3.js";import"./chunk-SUWDRJLB-u6UnS0XL.js";import"./dijkstra-COg3n3zL.js";var x,C,F=c({"src/assets/icons/ShareIcon.tsx"(){x=({...o})=>{const{color:t="var(--pcm-body-color-secondary)"}=o;return e.jsxs(r.svg,{xmlns:"http://www.w3.org/2000/svg",width:"12",height:"12",viewBox:"0 0 12 12",fill:"none",...o,children:[e.jsx("path",{d:"M8.51997 12H3.47999C1.56119 12 0 10.4388 0 8.52003V3.48024C0 1.56144 1.5612 0.000244141 3.47999 0.000244141H5.99998C6.33135 0.000244141 6.59998 0.268873 6.59998 0.600243C6.59998 0.931614 6.33135 1.20024 5.99998 1.20024H3.47999C2.22299 1.20024 1.2 2.22304 1.2 3.48024V8.52023C1.2 9.77763 2.22299 10.8002 3.47999 10.8002H8.51997C9.77717 10.8002 10.8 9.77763 10.8 8.52023V6.00023C10.8 5.66886 11.0686 5.40024 11.4 5.40024C11.7313 5.40024 12 5.66886 12 6.00023V8.52023C12 10.439 10.439 12.0002 8.51997 12Z",fill:t}),e.jsx("path",{d:"M5.60178 6.39823C5.36733 6.16402 5.36733 5.78404 5.60178 5.54983L10.9758 0.175837C11.21 -0.0586125 11.59 -0.0586125 11.8242 0.175837C12.0586 0.410045 12.0586 0.790028 11.8242 1.02424L6.44998 6.39823C6.21577 6.63268 5.83579 6.63268 5.60178 6.39823Z",fill:t}),e.jsx("path",{d:"M12 0.599999C12 0.931369 11.7313 1.2 11.4 1.2H8.59997C8.26852 1.20011 7.99976 0.93145 7.99976 0.599999C7.99976 0.268548 8.26852 -0.000114395 8.59997 0H11.4C11.7313 1.37329e-07 12 0.268629 12 0.599999Z",fill:t}),e.jsx("path",{d:"M11.4 3.99999C11.0686 3.99999 10.8 3.73136 10.8 3.39999V0.599999C10.8 0.268629 11.0686 0 11.4 0C11.7313 0 12 0.268629 12 0.599999V3.39999C12 3.73137 11.7313 3.99999 11.4 3.99999Z",fill:t})]})},C=x}}),g,b,h,G=c({"src/pages/walletconnect/styles.ts"(){g=s(r.div)`
  padding: 15px 30px;
  padding-top: 30px;
  padding-top: 0;
  display: flex;
  flex-direction: column;
`,s(r.div)`
  text-align: center;
  font-size: 18px;
  line-height: 25px;
  font-weight: 500;
  margin-bottom: 30px;
`,b=s(r.div)`
  display: flex;
  justify-content: space-between;
  gap: 28px;
  margin-top: 20px;

  button {
    border-radius: var(--pcm-rounded-lg);
    border: 1px solid var(--pcm-button-border-color);
    background-color: var(--pcm-body-background) !important;
    color: var(--pcm-body-background);
    font-size: 12px;
    font-style: normal;
    font-weight: 400;
    height: 36px;
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--pcm-body-color-secondary);

    &:hover {
      background-color: #fff;
    }
  }
`,h=s.div`
  margin-top: 28px;
  padding: 0 16px;
  color: var(--pcm-body-color-secondary);
  text-align: center;
  font-size: 14px;
  font-style: normal;
  font-weight: 400;
  line-height: 16px;
`}}),m,J,N=c({"src/pages/walletconnect/index.tsx"(){F(),M(),H(),j(),U(),Q(),Z(),E(),z(),A(),R(),G(),m=({wallet:o})=>{var u;const{navigate:t}=P(),i=T(),d=S(),{uri:n="",requestUri:l,error:v}=I((u=o==null?void 0:o.connector)==null?void 0:u.id),{config:y}=q(),{isConnected:p}=B();a.useEffect(()=>{l()},[]),a.useEffect(()=>()=>{p||y.setState(f=>({...f,status:f.current?"connected":"disconnected"}))},[p]);const _=a.useMemo(()=>!(d||(o==null?void 0:o.id)==="walletConnect"),[o,d]);return e.jsx(D,{style:{marginTop:0},children:e.jsxs(g,{children:[e.jsx(W,{value:n&&o.getWalletConnectDeeplink?o.getWalletConnectDeeplink(n):n,failed:!!v,failedCallback:()=>{l()},image:o==null?void 0:o.icon}),!!n&&e.jsxs(b,{children:[e.jsx(k,{variant:"button",string:n,children:i.copyQRURI}),_&&e.jsx(V,{style:{background:"none",borderColor:"var(--pcm-button-border-color)"},onClick:()=>{t("download-app",{wallet:o})},children:e.jsxs(L,{gap:8,style:{color:"var(--pcm-body-color-secondary)"},children:[e.jsx(C,{}),i.getWallet]})})]}),e.jsx(h,{children:i.scanQRCode})]})})},J=m}});N();export{J as default};
