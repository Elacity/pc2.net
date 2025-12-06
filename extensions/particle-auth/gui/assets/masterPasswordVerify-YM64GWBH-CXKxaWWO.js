import{B as N}from"./chunk-KLME7BMQ-zNTfkf43.js";import{p as R}from"./chunk-TT34D6R6-0i1ML0h_.js";import{aw as T,r as n,$ as A,a4 as e,Y as k,an as F,a5 as P,ao as V,bj as C,aW as p,aX as s}from"./index-ppiGxaDG.js";import{u as I}from"./useRequest-CZ4eTXhj.js";import{F as i}from"./index-Cq2aMzvV.js";import{T as M,S as W}from"./index-DGlgR0aX.js";import"./chunk-YNAB6HVU-CZv18A4P.js";import"./index-7BPZKtR3.js";import"./throttle-BkcrBANw.js";import"./TextArea-CAlaOLlS.js";import"./colors-b7HGF3b8.js";import"./index-BqT3UfUb.js";var B=`.mp-verify-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow: auto;
  font-size: 14px;
  color: var(--text-color);
  background-color: var(--theme-background-color);
}
.mp-verify-container .ant-form {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  max-width: 800px;
  min-height: 360px;
}
.mp-verify-container .ant-form .scroll-content {
  flex: 1;
  width: 100%;
  padding-left: 18px;
  padding-right: 18px;
}
.mp-verify-container .ant-form-item {
  margin-bottom: 0;
}
.mp-verify-container .mp-verify-title {
  margin-top: 16px;
  font-weight: 500;
  font-size: 18px;
  line-height: 28px;
  color: var(--text-color);
}
.mp-verify-container .mp-input-name {
  align-self: flex-start;
  margin-top: 30px;
  font-weight: 400;
}
.mp-verify-container .mp-input {
  margin-top: 6px;
}
.mp-verify-container .mp-input-error {
  align-self: flex-start;
  margin-top: 8px;
  color: var(--error-color);
}
.mp-verify-container .mp-tip-space {
  width: 100%;
  margin-top: 25px;
  margin-bottom: 110px;
  line-height: 20px;
}
.mp-verify-container .mp-tip-space span {
  color: var(--text-color);
}
.mp-verify-container .bottom-container {
  width: 100%;
}
.mp-verify-container .bottom-container.footer {
  padding-left: 18px;
  padding-right: 18px;
}
.mp-verify-container .bottom-container .mp-next {
  position: relative;
  display: block;
  width: 100%;
  max-width: 800px;
  margin: auto;
}
.mp-verify-container .bottom-container .footer-box {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: var(--footer-height);
  margin: 0;
}
.mp-verify-container .bottom-container .footer-box img {
  margin: 0;
}
`,G=f=>{let{Text:m,Link:d}=M,l=T(),[u,a]=n.useState(!1),{t:o}=A(),{loginVerifyMasterPassword:v}=f||{},c=e.useRef(null),[g,x]=n.useState(!0),{loginSuccessRedirectToApp:y}=k(),h=F(),{run:E,loading:w}=I(C,{manual:!0,onBefore:()=>{p({record_type:s.PAGE_MASTER_PASSWORD_VERIFY})},onSuccess:t=>{t?(p({record_type:s.PAGE_MASTER_PASSWORD_VERIFY_SUCCESS}),v?y():l(-1)):a(!0)},onError:t=>{h.error((t==null?void 0:t.message)||"check master password error")}}),b=()=>{l("/account/master-password/description")},_=t=>{let{password:r}=t;(r==null?void 0:r.length)>=6&&(r==null?void 0:r.length)<=20?(a(!1),E(r)):a(!0)},S=t=>{let{password:r}=t;a(!1),x(!r)};return n.useEffect(()=>{setTimeout(()=>{var t,r;(r=(t=c.current)==null?void 0:t.querySelector(".password-input input"))==null||r.focus()},200)},[]),e.createElement("div",{className:"mp-verify-container",ref:c},e.createElement("style",null,P(B)),e.createElement("div",{className:"mp-verify-title"},o("account.restore_wallet")),e.createElement(i,{layout:"vertical",onFinish:_,onValuesChange:S},e.createElement("div",{className:"scroll-content"},e.createElement("div",{className:"mp-input-name padding-top-16"},o("account.master_password")),e.createElement(i.Item,{name:"password"},e.createElement(N,{className:"mp-input"})),u&&e.createElement("div",{className:"mp-input-error"},o("account.password_error")),e.createElement(W,{direction:"vertical",className:"mp-tip-space"},e.createElement(m,null,o("account.mpc_tss_intro")),e.createElement(m,null,o("account.input_decrypt_hint")," ",e.createElement(d,{onClick:b,className:"more-text-btn"},o("account.learn_more_period"))))),e.createElement(i.Item,null,e.createElement("div",{className:"bottom-container footer"},e.createElement(V,{className:"primary-antd-btn mp-next",htmlType:"submit",loading:w,disabled:g},o("common.confirm")),e.createElement(R,{className:"footer-box-v2"})))))},H=G;export{H as default};
