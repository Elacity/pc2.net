import{A as v}from"./chunk-JWIG6G2P-BSAf9NKm.js";import{Y as b,$ as g,r as m,ap as h,a4 as r,a5 as E,br as x,bm as P,av as c}from"./index-Da1B_bQX.js";import{u as C}from"./useRequest-BKPiX46F.js";import"./chunk-YNAB6HVU-CEwbjBrt.js";import"./chunk-TT34D6R6-L6WQbq6J.js";import"./index-DWJUcTgy.js";import"./throttle-CV9_TlMb.js";var V=`.payment-password-drawer {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.payment-password-drawer .ant-drawer-body {
  padding-right: 0;
  padding-left: 0;
  overflow: hidden;
}
.payment-password-drawer .ant-drawer-content-wrapper {
  width: 100% !important;
}
.payment-password-drawer .ant-drawer-content .ant-drawer-wrapper-body .ant-drawer-header {
  display: none;
}
.payment-password-drawer .particle-pc-drawer .payment-verify-content {
  margin-top: 38px;
}
.payment-password-drawer .payment-verify-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  margin-top: 22px;
}
.payment-password-drawer .payment-verify-content .particle-keywords-map {
  position: absolute;
}
@media (min-width: 600px) {
  .payment-password-drawer {
    position: absolute;
  }
}
`,_=({props:a})=>{let{setPaymentVerify:o,setWrongPassword:s}=b(),{t}=g(),[l,n]=m.useState(""),{authCoreModal:w}=h();m.useEffect(()=>{a.visible&&n("")},[a.visible]);let{loading:i,run:y}=C(P,{manual:!0,onSuccess:(e,d)=>{var p;o({visible:!1}),(p=a.onVerifyCompleted)==null||p.call(a,l)},onError:e=>{if(n(""),(e==null?void 0:e.error_code)===c.WrongPaymentPassword)s({visible:!0});else if((e==null?void 0:e.error_code)===c.SecurityAccountFrozen){let d=e.extra.seconds||0;s({visible:!0,accountFrozen:{seconds:d}})}}}),u=()=>{var e;if(i)return!1;o({visible:!1}),(e=a.onVerifyFailed)==null||e.call(a,t("common.cancel"))},f=e=>{n(e),e.length===6&&y(e)};return r.createElement(r.Fragment,null,r.createElement("style",null,E(V)),r.createElement(x,{visible:a.visible,placement:"bottom",height:421,closable:!1,maskClosable:!1,onClose:u,className:"payment-password-drawer",title:a.type==="close"?t("account.close_payment_password"):t("account.payment_password"),forceRender:!0,getContainer:()=>w.rootBody},r.createElement("div",{className:"content payment-verify-content"},r.createElement(v,{onChange:f,value:l,keyboardInvisible:i}))))},N=_;export{N as default};
