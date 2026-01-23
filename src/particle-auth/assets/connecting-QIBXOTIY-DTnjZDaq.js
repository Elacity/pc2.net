import{i as w,u as ee}from"./chunk-BSJODNDT-m9uV0Rdg.js";import{i as ne,u as te}from"./chunk-QXMKCDWX-CQBNT0sB.js";import{i as ie,a as oe,C as se,b as ce,R as re,c as ae,d as de,S as Ce}from"./chunk-SUWDRJLB-mQPrle5U.js";import{i as le,u as ue}from"./chunk-EK3VN6OT-BRoGG05-.js";import{i as pe,P as fe}from"./chunk-QH6JFFQS-qVVYCMOQ.js";import{_ as x,i as me,a as ge,b as Ee,c as U,d as he,e as V,f as R,g as xe,h as Ne,u as ve,r as a,j as O,k as W,l as ye,m as M,n as i,I as be,o as Ae,p as T,q as D,A as H,s as Ie,t as je,v as E,w as h}from"./index-DYAektXa.js";import{u as ke}from"./use-animation-dFvFY_Xi.js";var q,B,F,J,Te=x({"src/components/squircleSpinner/styles.ts"(){q=E(h.div)`
  z-index: 4;
  position: relative;
  overflow: hidden;
  svg {
    z-index: 3;
    position: relative;
    display: block;
  }
`,B=E(h.div)`
  z-index: 2;
  position: absolute;
  overflow: hidden;
  inset: ${e=>e.inset??3}px;
  border-radius: 16px;
  background: var(--pcm-body-background);
  svg,
  img {
    pointer-events: none;
    display: block;
    width: 100%;
    height: 100%;
  }
`,F=E(h.div)`
  position: absolute;
  inset: 1px;
  /* overflow: hidden; */
`,J=E(h.div)`
  pointer-events: none;
  user-select: none;
  z-index: 1;
  position: absolute;
  inset: -25%;
  &:before {
    content: '';
    position: absolute;
    inset: 0;
    background: conic-gradient(
      from -90deg,
      transparent,
      transparent,
      transparent,
      transparent,
      transparent,
      var(--pcm-accent-color)
    );
    animation: rotateSpinner 1200ms linear infinite;
  }
  @keyframes rotateSpinner {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`}}),L,z,De=x({"src/components/squircleSpinner/index.tsx"(){Te(),L=({logo:e,connecting:r=!0})=>i.jsxs(q,{transition:{duration:.5,ease:[.175,.885,.32,.98]},children:[i.jsx(B,{children:e}),i.jsx(F,{children:i.jsx(H,{children:r&&i.jsx(J,{initial:{opacity:0},animate:{opacity:1},exit:{opacity:0,transition:{duration:0}}},"Spinner")})}),i.jsxs("svg",{"aria-hidden":"true",width:"64",height:"64",viewBox:"0 0 102 102",fill:"none",children:[i.jsx("rect",{x:"7.57895",y:"7.57895",width:"86.8421",height:"86.8421",rx:"19.2211",stroke:"black",strokeOpacity:"0.02",strokeWidth:"1.15789"}),i.jsx("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M0 0H102V102H0V0ZM7 38.284C7 27.5684 7 22.2106 9.01905 18.0892C10.9522 14.1431 14.1431 10.9522 18.0892 9.01905C22.2106 7 27.5684 7 38.284 7H63.716C74.4316 7 79.7894 7 83.9108 9.01905C87.8569 10.9522 91.0478 14.1431 92.9809 18.0892C95 22.2106 95 27.5684 95 38.284V63.716C95 74.4316 95 79.7894 92.9809 83.9108C91.0478 87.8569 87.8569 91.0478 83.9108 92.9809C79.7894 95 74.4316 95 63.716 95H38.284C27.5684 95 22.2106 95 18.0892 92.9809C14.1431 91.0478 10.9522 87.8569 9.01905 83.9108C7 79.7894 7 74.4316 7 63.716V38.284ZM41.5 0.5H41.4325C34.7246 0.499996 29.6023 0.499994 25.5104 0.823325C21.388 1.14906 18.1839 1.80986 15.3416 3.20227C10.0602 5.78959 5.78959 10.0602 3.20227 15.3416C1.80986 18.1839 1.14906 21.388 0.823325 25.5104C0.499994 29.6023 0.499996 34.7246 0.5 41.4325V41.5V55.5938C0.5 55.6808 0.507407 55.766 0.521624 55.849C0.507407 55.9319 0.5 56.0172 0.5 56.1042V60.5V60.5675C0.499996 67.2754 0.499994 72.3977 0.823325 76.4896C1.14906 80.612 1.80986 83.8161 3.20227 86.6584C5.78959 91.9398 10.0602 96.2104 15.3416 98.7977C18.1839 100.19 21.388 100.851 25.5104 101.177C29.6022 101.5 34.7244 101.5 41.432 101.5H41.4324H41.5H43.4227H60.5H60.5675H60.568C67.2756 101.5 72.3977 101.5 76.4896 101.177C80.612 100.851 83.8161 100.19 86.6584 98.7977C91.9398 96.2104 96.2104 91.9398 98.7977 86.6584C100.19 83.8161 100.851 80.612 101.177 76.4896C101.5 72.3978 101.5 67.2756 101.5 60.568V60.5676V60.5V41.5V41.4324V41.432C101.5 34.7244 101.5 29.6022 101.177 25.5104C100.851 21.388 100.19 18.1839 98.7977 15.3416C96.2104 10.0602 91.9398 5.78959 86.6584 3.20227C83.8161 1.80986 80.612 1.14906 76.4896 0.823325C72.3977 0.499994 67.2754 0.499996 60.5675 0.5H60.5H41.5ZM3.5 56.1042C3.5 56.0172 3.49259 55.9319 3.47838 55.849C3.49259 55.766 3.5 55.6808 3.5 55.5938V41.5C3.5 34.7112 3.50109 29.7068 3.814 25.7467C4.1256 21.8032 4.73946 19.0229 5.89635 16.6614C8.19077 11.9779 11.9779 8.19077 16.6614 5.89635C19.0229 4.73946 21.8032 4.1256 25.7467 3.814C29.7068 3.50109 34.7112 3.5 41.5 3.5H60.5C67.2888 3.5 72.2932 3.50109 76.2533 3.814C80.1968 4.1256 82.977 4.73946 85.3386 5.89635C90.022 8.19077 93.8092 11.9779 96.1036 16.6614C97.2605 19.0229 97.8744 21.8032 98.186 25.7467C98.4989 29.7068 98.5 34.7112 98.5 41.5V60.5C98.5 67.2888 98.4989 72.2932 98.186 76.2533C97.8744 80.1968 97.2605 82.9771 96.1036 85.3386C93.8092 90.022 90.022 93.8092 85.3386 96.1036C82.977 97.2605 80.1968 97.8744 76.2533 98.186C72.2932 98.4989 67.2888 98.5 60.5 98.5H43.4227H41.5C34.7112 98.5 29.7068 98.4989 25.7467 98.186C21.8032 97.8744 19.0229 97.2605 16.6614 96.1036C11.9779 93.8092 8.19077 90.022 5.89635 85.3386C4.73946 82.9771 4.1256 80.1968 3.814 76.2533C3.50109 72.2932 3.5 67.2888 3.5 60.5V56.1042Z",fill:"var(--pcm-body-background)"})]})]}),z=L}});function Le(){const{connectAsync:e}=M(),{config:r}=O(),C=te("evmWallet"),{updateLastConnectorId:o}=W(),[s,d]=a.useState();return{error:s,openW3m:async()=>{if(d(void 0),C&&C.w3mConnector){const u=document.createElement("style");u.innerHTML="w3m-modal, wcm-modal{ --wcm-z-index: 2147483647; --w3m-z-index:2147483647; }",document.head.appendChild(u);try{let l=C._internal.connectors.setup(C.w3mConnector);l=r._internal.connectors.setup(l),await e({connector:l}),o("walletConnect")}catch(l){d(l)}finally{document.head.removeChild(u)}}}}}var Se=x({"src/hooks/useWalletConnectModal.tsx"(){U(),V(),R(),ne()}}),n,S,_,_e,Ue=x({"src/pages/connecting/index.tsx"(){ie(),me(),pe(),ge(),De(),Ee(),U(),he(),V(),le(),R(),xe(),Se(),w(),Ne(),oe(),n={CONNECTED:"connected",CONNECTING:"connecting",FAILED:"failed",REJECTED:"rejected",NOTCONNECTED:"notconnected",UNAVAILABLE:"unavailable"},S={initial:{opacity:0,scale:.95},animate:{opacity:1,scale:1,transition:{ease:[.16,1,.3,1],duration:.25}}},_=({wallet:e,authParams:r,passkeyParams:C})=>{var k;const o=ve(),[s,d]=a.useState(n.CONNECTING),f=ke(),{config:u}=O(),{uri:l,requestUri:G,available:Z,error:N}=ee((k=e==null?void 0:e.connector)==null?void 0:k.id),g=ue(),{updateLastConnectorId:$}=W(),{openW3m:K,error:v}=Le(),{isConnected:I}=ye(),p=a.useCallback(t=>{if(t){if(t.code)switch(t.code){case-32002:d(n.NOTCONNECTED);break;case 4001:d(n.REJECTED);break;default:d(n.FAILED);break}else if(t.message)switch(t.message){case"User rejected request":d(n.REJECTED);break;default:d(n.FAILED);break}}},[]),Q=a.useMemo(()=>({onMutate:({connector:t})=>{d(t?n.CONNECTING:n.UNAVAILABLE)},onSettled:(t,A)=>{p(A)}}),[p]),{connect:X}=M(Q),y=a.useMemo(()=>e.connector.id==="passkeySmartWallet",[e]),c=a.useMemo(()=>{let t=e.icon;r!=null&&r.socialType&&(t=i.jsx(be,{authType:r.socialType}));const A=y?{isRegistering:(C==null?void 0:C.isRegistering)??!1}:void 0;return{id:e.id,name:e.name,shortName:e.shortName??e.name,icon:t,iconShape:e.iconShape??"circle",iconShouldShrink:e.iconShouldShrink,isAuth:!!(r!=null&&r.socialType),passkey:A}},[e,r,C,y]),m=a.useMemo(()=>e!=null&&e.downloadUrls?{name:Object.keys(e==null?void 0:e.downloadUrls)[0],label:Object.keys(e.downloadUrls)[0].charAt(0).toUpperCase()+Object.keys(e.downloadUrls)[0].slice(1),url:e==null?void 0:e.downloadUrls[Object.keys(e.downloadUrls)[0]]}:void 0,[e]),Y=async()=>{f.stop(),f.set("initial"),await f.start("animate")},j=()=>{var t;if(d(n.CONNECTING),g&&e.connector.chainType==="evm"&&e.getWalletConnectDeeplink&&!je(e.connector.id)&&!e.isInstalled){if(T(e.connector.id)){K();return}else if(Z){G();return}}e!=null&&e.isInstalled&&(e!=null&&e.connector)?(r!=null&&r.socialType&&((t=u.storage)==null||t.setItem("recentConnectorId",e.connector.id),$(e.connector.id)),X({connector:e==null?void 0:e.connector,authParams:r,passkeyParams:C})):d(n.UNAVAILABLE)};a.useEffect(()=>{const t=setTimeout(j,200);return()=>{clearTimeout(t)}},[]),a.useEffect(()=>{if(l&&g&&e.connector.chainType==="evm"&&e.getWalletConnectDeeplink){const t=e.getWalletConnectDeeplink(l);Ae(t)}},[l]),a.useEffect(()=>{g&&N&&p(N)},[N,p]),a.useEffect(()=>{g&&T(e.connector.id)&&v&&p(v)},[v,p]),a.useEffect(()=>()=>{I||u.setState(t=>({...t,status:t.current?"connected":"disconnected"}))},[I]);const b=a.useMemo(()=>{const t=c.shortName||c.name||"Wallet";return s==n.CONNECTED?o.connectingConnected:s==n.FAILED?o.connectingFailed:s==n.REJECTED?o.connectingRejected:s==n.NOTCONNECTED?o.connectingNotconnected.format(t):s==n.UNAVAILABLE?m?o.connectingUnavailable:D(c.id)?o.connectingPasskeyUnavailable:o.connectingInstall.format(t):o.connectingRequest},[s,o,c,m]),P=a.useMemo(()=>{const t=c.shortName||c.name||"Wallet";return s==n.CONNECTED?o.connectingConnectedDesc:s==n.FAILED?o.connectingFailedDesc:s==n.REJECTED?o.connectingRejectedDesc:s==n.NOTCONNECTED?o.connectingNotconnectedDesc.format(t):s==n.UNAVAILABLE?m?o.connectingUnavailableDesc.format(t,m.label):D(c.id)?o.connectingPasskeyUnavailableDesc:o.connectingInstallDesc.format(t):c.isAuth?o.connectingRequestAuthDesc:c.passkey?c.passkey.isRegistering?o.setupPasskeyPrompt:o.passkeyPrompt:o.connectingRequestDesc},[s,o,c,m]);return a.useEffect(()=>{b&&Y()},[b]),i.jsx(fe,{children:i.jsxs(se,{children:[i.jsxs(ce,{$shake:s===n.FAILED||s===n.REJECTED,$circle:c.iconShape==="circle",children:[i.jsx(H,{children:(s===n.FAILED||s===n.REJECTED)&&i.jsx(re,{"aria-label":"Retry",initial:{opacity:0,scale:.8},animate:{opacity:1,scale:1},exit:{opacity:0,scale:.8},whileTap:{scale:.9},transition:{duration:.1},onClick:j,children:i.jsx(ae,{children:i.jsx(de,{})})})}),c.iconShape==="circle"?i.jsx(Ie,{logo:s===n.UNAVAILABLE?i.jsx("div",{style:{transform:y?"scale(1)":"scale(1.14)",position:"relative",width:"100%"},children:c.icon}):i.jsx(i.Fragment,{children:c.icon}),smallLogo:c.iconShouldShrink,connecting:s===n.CONNECTING,unavailable:s===n.UNAVAILABLE}):i.jsx(z,{logo:s===n.UNAVAILABLE?i.jsx("div",{style:{position:"relative",width:"60px",height:"60px"},children:i.jsx("div",{style:{transform:"scale(0.75)"},children:c.icon})}):i.jsx(i.Fragment,{children:c.icon}),connecting:s===n.CONNECTING})]}),i.jsxs(Ce,{variants:S,initial:"animate",animate:f,children:[i.jsx("div",{children:b}),i.jsx("span",{children:P})]})]})})},_e=_}});Ue();export{n as States,_e as default};
