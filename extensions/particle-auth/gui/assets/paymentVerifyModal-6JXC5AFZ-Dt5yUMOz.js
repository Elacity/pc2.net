import{Q as v}from"./chunk-ZQ2O7W7T-BSyOpIFK.js";import{V as b,W as h,r as m,z as g,o as a,aG as x,au as E,M as c}from"./index-CaXbrBtJ.js";import{u as P}from"./useRequest-BnTYF8DM.js";import"./chunk-GKIRU5P2-B6ZqBHrn.js";import"./chunk-CHA6AH7V-Bh_Ms4Al.js";import"./index-DCYoqd6f.js";import"./throttle-CnyNgHA9.js";var C=`.payment-password-drawer {
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
`,_=({props:r})=>{let{setPaymentVerify:o,setWrongPassword:s}=b(),{t}=h(),[l,n]=m.useState(""),{authCoreModal:w}=g();m.useEffect(()=>{r.visible&&n("")},[r.visible]);let{loading:i,run:y}=P(E,{manual:!0,onSuccess:(e,d)=>{var p;o({visible:!1}),(p=r.onVerifyCompleted)==null||p.call(r,l)},onError:e=>{if(n(""),(e==null?void 0:e.error_code)===c.WrongPaymentPassword)s({visible:!0});else if((e==null?void 0:e.error_code)===c.SecurityAccountFrozen){let d=e.extra.seconds||0;s({visible:!0,accountFrozen:{seconds:d}})}}}),u=()=>{var e;if(i)return!1;o({visible:!1}),(e=r.onVerifyFailed)==null||e.call(r,t("common.cancel"))},f=e=>{n(e),e.length===6&&y(e)};return a.createElement(a.Fragment,null,a.createElement("style",null,C),a.createElement(x,{visible:r.visible,placement:"bottom",height:421,closable:!1,maskClosable:!1,onClose:u,className:"payment-password-drawer",title:r.type==="close"?t("account.close_payment_password"):t("account.payment_password"),forceRender:!0,getContainer:()=>w.rootBody},a.createElement("div",{className:"content payment-verify-content"},a.createElement(v,{onChange:f,value:l,keyboardInvisible:i}))))},S=_;export{S as default};
