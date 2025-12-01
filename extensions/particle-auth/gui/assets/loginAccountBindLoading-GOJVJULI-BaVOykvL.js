import{Y as w}from"./chunk-37ISZE7G-YL9du2Vf.js";import{z as E}from"./loginAccount-QCMUZ6H6-CjiSdZuY.js";import{w as _}from"./chunk-SL2KVVUD-D0vEhO6V.js";import{a$ as k,r as l,b0 as N,b1 as z,b2 as v,b3 as B,Z as T,V as F,W as $,N as A,x as M,o as e,c as W,y as j,an as D}from"./index-CaXbrBtJ.js";import{u as I}from"./index-DCYoqd6f.js";import"./chunk-GKIRU5P2-B6ZqBHrn.js";import"./chunk-CHA6AH7V-Bh_Ms4Al.js";import"./throttle-CnyNgHA9.js";function L(s,n){var t,a=k(s),u=(t=n==null?void 0:n.wait)!==null&&t!==void 0?t:1e3,r=l.useMemo(function(){return N(function(){for(var c=[],o=0;o<arguments.length;o++)c[o]=arguments[o];return a.current.apply(a,z([],v(c),!1))},u,n)},[]);return B(function(){r.cancel()}),{run:r,cancel:r.cancel,flush:r.flush}}function R(s,n,t){var a=v(l.useState({}),2),u=a[0],r=a[1],c=L(function(){r({})},t).run;l.useEffect(function(){return c()},n),I(s,[u])}var S=`.account-bind-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.account-bind-container .particle-connect-form-contaier {
  flex: 1;
}
.account-bind-container .particle-loading,
.account-bind-container .result-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  padding-bottom: 100px;
  font-size: 18px;
  color: var(--text-color);
  position: relative;
}
.account-bind-container .particle-loading .loading-wrap,
.account-bind-container .result-content .loading-wrap {
  position: relative;
}
.account-bind-container .particle-loading .loading-wrap .logo-img,
.account-bind-container .result-content .loading-wrap .logo-img {
  width: 100px;
  height: 100px;
  font-size: 110px;
}
.account-bind-container .particle-loading .loading-wrap .particle-loading-img,
.account-bind-container .result-content .loading-wrap .particle-loading-img {
  width: 100%;
  height: 100%;
  animation: loading-inner 1.5s linear infinite;
}
.account-bind-container .particle-loading .loading-wrap h3,
.account-bind-container .result-content .loading-wrap h3 {
  color: var(--text-color);
}
.account-bind-container .particle-loading .loading-wrap p,
.account-bind-container .result-content .loading-wrap p {
  font-size: 14px;
  color: var(--secondary-text-color);
  position: absolute;
  width: 110%;
  height: 110%;
  margin: 0;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.account-bind-container .link_btn {
  width: auto;
  height: 32px;
  font-size: 14px;
}
.account-bind-container .result-content .back {
  margin-top: 40px;
}
.account-bind-container .result-content .back button {
  display: flex;
  align-items: center;
}
@keyframes loading-inner {
  0% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(180deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
`,U=s=>{let n=s,{authType:t="google",verifyToken:a,code:u}=n,r=T(),{modalOptions:c}=F(),{t:o}=$(),[h,x]=l.useState(!0),{userInfo:m}=A(),y=M(),p=l.useMemo(()=>E({userInfo:m,t:o}),[m,o]),g=l.useMemo(()=>({...p.find(i=>i.type.replace(/v1$/,"")==t)||{}}),[p,n]);return R(()=>{t&&a&&D({provider:t,thirdparty_code:u,security_account_verify_token:a,version:"v2"}).then(i=>{x(!1)}).catch(i=>{let f=i.message;if((i==null?void 0:i.error_code)===20109){let b=`error.server_${t}_20109`,d=o(b);d&&d!=b&&(f=d)}y.error(f),setTimeout(()=>{r("/account/security",{replace:!0})})})},[t,a],{wait:50}),e.createElement("div",{className:"account-bind-container"},e.createElement("style",null,S),e.createElement(_,{displayBackBtn:!0}),e.createElement("div",{className:"particle-connect-form-contaier center-center flex-column"},h?e.createElement("div",{className:"particle-loading"},e.createElement("div",{className:"loading-wrap"},e.createElement("img",{src:W(c.themeType)[t]||"",className:"logo-img logo-img-2",alt:"logo"}),e.createElement("p",null,e.createElement("img",{className:"particle-loading-img",src:w,alt:""})))):e.createElement("div",{className:"result-content resultsuccess"},e.createElement("img",{src:g==null?void 0:g.icon,alt:""}),e.createElement("div",{className:"info"},"Binding succeeded！"),e.createElement("div",{className:"back"},e.createElement(j,{type:"primary",onClick:()=>{r("/account/security",{replace:!0})}},"Back")))))},J=U;export{J as default};
