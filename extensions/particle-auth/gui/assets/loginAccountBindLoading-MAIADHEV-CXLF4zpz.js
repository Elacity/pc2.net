import{Y as w}from"./chunk-37ISZE7G-YL9du2Vf.js";import{j as E}from"./loginAccount-26B5XW5Y-B907o2_6.js";import{C as _}from"./chunk-PHADJY2T-0y-OPqHT.js";import{cc as k,r as l,cd as N,ce as B,cf as b,cg as $,aw as z,Y as T,$ as j,ax as F,an as Y,a4 as e,a5 as A,ch as C,ao as M,be as U}from"./index-DyLx61cs.js";import{u as D}from"./index-meGEoiFe.js";import"./chunk-YNAB6HVU-C8AyaD9d.js";import"./chunk-TT34D6R6-C0ZJYwIH.js";import"./throttle-UlvUQgKO.js";function I(s,n){var t,a=k(s),u=(t=n==null?void 0:n.wait)!==null&&t!==void 0?t:1e3,r=l.useMemo(function(){return N(function(){for(var o=[],c=0;c<arguments.length;c++)o[c]=arguments[c];return a.current.apply(a,B([],b(o),!1))},u,n)},[]);return $(function(){r.cancel()}),{run:r,cancel:r.cancel,flush:r.flush}}function L(s,n,t){var a=b(l.useState({}),2),u=a[0],r=a[1],o=I(function(){r({})},t).run;l.useEffect(function(){return o()},n),D(s,[u])}var R=`.account-bind-container {
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
`,S=s=>{let n=s,{authType:t="google",verifyToken:a,code:u}=n,r=z(),{modalOptions:o}=T(),{t:c}=j(),[h,x]=l.useState(!0),{userInfo:m}=F(),y=Y(),p=l.useMemo(()=>E({userInfo:m,t:c}),[m,c]),g=l.useMemo(()=>({...p.find(i=>i.type.replace(/v1$/,"")==t)||{}}),[p,n]);return L(()=>{t&&a&&U({provider:t,thirdparty_code:u,security_account_verify_token:a,version:"v2"}).then(i=>{x(!1)}).catch(i=>{let f=i.message;if((i==null?void 0:i.error_code)===20109){let v=`error.server_${t}_20109`,d=c(v);d&&d!=v&&(f=d)}y.error(f),setTimeout(()=>{r("/account/security",{replace:!0})})})},[t,a],{wait:50}),e.createElement("div",{className:"account-bind-container"},e.createElement("style",null,A(R)),e.createElement(_,{displayBackBtn:!0}),e.createElement("div",{className:"particle-connect-form-contaier center-center flex-column"},h?e.createElement("div",{className:"particle-loading"},e.createElement("div",{className:"loading-wrap"},e.createElement("img",{src:C(o.themeType)[t]||"",className:"logo-img logo-img-2",alt:"logo"}),e.createElement("p",null,e.createElement("img",{className:"particle-loading-img",src:w,alt:""})))):e.createElement("div",{className:"result-content resultsuccess"},e.createElement("img",{src:g==null?void 0:g.icon,alt:""}),e.createElement("div",{className:"info"},"Binding succeeded！"),e.createElement("div",{className:"back"},e.createElement(M,{type:"primary",onClick:()=>{r("/account/security",{replace:!0})}},"Back")))))},P=S;export{P as default};
