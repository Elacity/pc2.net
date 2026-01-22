import{B as v}from"./chunk-KLME7BMQ-CNe4LLBi.js";import{C as y}from"./chunk-PHADJY2T-BlObQCD7.js";import{p as b}from"./chunk-TT34D6R6-B8OOeA09.js";import{aw as N,$ as _,r as i,an as k,a4 as e,a5 as M,ao as S,bk as B}from"./index-DjlN05_1.js";import{u as F}from"./useRequest-pZXEHp9v.js";import{F as o}from"./index-C25-57Go.js";import{T,S as C}from"./index-BepmnNoa.js";import"./chunk-YNAB6HVU-Ds67li6D.js";import"./index-BOW4rDJ4.js";import"./throttle-DFODRO_a.js";import"./TextArea-BQchiP5X.js";import"./colors-OSntqG3Z.js";import"./index-BqT3UfUb.js";var P=`.mp-change-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow: auto;
  font-size: 14px;
  color: var(--text-color);
}
.mp-change-container .wapper {
  flex: 1;
  width: 100%;
  padding: 0 18px;
}
.mp-change-container .ant-form {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 800px;
  height: 100%;
}
.mp-change-container .ant-form .ant-form-item {
  margin-bottom: 0;
}
.mp-change-container .ant-form .scroll-content {
  flex: 1;
  width: 100%;
}
.mp-change-container .mp-change-title {
  margin-top: 16px;
  font-weight: 500;
  font-size: 18px;
  line-height: 28px;
  color: var(--text-color);
}
.mp-change-container .mp-input-name {
  align-self: flex-start;
  margin-top: 10px;
  font-weight: 400;
}
.mp-change-container .mp-input {
  margin-top: 6px;
}
.mp-change-container .mp-input-error {
  align-self: flex-start;
  margin-top: 8px;
  color: var(--error-color);
}
.mp-change-container .mp-tip-space {
  width: 100%;
  margin-top: 25px;
  margin-bottom: 110px;
  line-height: 20px;
}
.mp-change-container .mp-tip-space span {
  color: var(--text-color);
}
.mp-change-container .bottom-container .mp-next {
  width: 100%;
}
.mp-change-container .bottom-container .footer-box {
  display: flex;
  justify-content: center;
  align-items: center;
  height: var(--footer-height);
  margin: 0;
}
.mp-change-container .bottom-container .footer-box .footer {
  margin: 0;
}
`,z=()=>{let m=N(),{t:r}=_(),{Text:c,Link:s}=T,[p,n]=i.useState(!1),l=k(),[u,d]=i.useState(!0),{run:g,loading:h}=F(t=>B(t).then(a=>{if(!a)throw new Error("Master password decryption error");return a}),{manual:!0,onSuccess:t=>{f()},onError:t=>{(t==null?void 0:t.message)==="Master password decryption error"?n(!0):l.error((t==null?void 0:t.message)||"check master password error")}}),f=()=>{m("/account/master-password",{state:{setNewMasterPassword:!0}})},x=t=>{let{password:a}=t;a&&a.length>=6&&a.length<=20?g(a):n(!0)},w=t=>{n(!1);let{password:a}=t;d(!a)},E=()=>{m("/account/master-password/description")};return e.createElement("div",{className:"mp-change-container"},e.createElement("style",null,M(P)),e.createElement(y,{displayBackBtn:!0},r("account.current_master_password")),e.createElement("div",{className:"wapper"},e.createElement(o,{onFinish:x,layout:"vertical",onValuesChange:w},e.createElement("div",{className:"scroll-content"},e.createElement("div",{className:"mp-input-name padding-top-16"},r("account.input_master_password")),e.createElement(o.Item,{name:"password"},e.createElement(v,{className:"mp-input"})),p&&e.createElement("div",{className:"mp-input-error"},r("account.password_error")),e.createElement(C,{direction:"vertical",className:"mp-tip-space"},e.createElement(c,null,r("account.mpc_tss_intro")),e.createElement(c,null,r("account.input_decrypt_hint")," ",e.createElement(s,{onClick:E,className:"more-text-btn"},r("account.learn_more_period"))))),e.createElement(o.Item,null,e.createElement("div",{className:"bottom-container"},e.createElement(S,{className:"primary-antd-btn mp-next",htmlType:"submit",loading:h,disabled:u},r("common.next")),e.createElement(b,null))))))},G=z;export{G as default};
