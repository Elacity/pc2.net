import{B as v}from"./chunk-BA6Y4UV5-BcP7r5-r.js";import{w as y}from"./chunk-SL2KVVUD-D0vEhO6V.js";import{N as b}from"./chunk-CHA6AH7V-Bh_Ms4Al.js";import{Z as N,W as _,r as i,x as k,o as e,y as M,ar as B}from"./index-CaXbrBtJ.js";import{u as C}from"./useRequest-BnTYF8DM.js";import{T as S,C as T}from"./index-BbKrBdoD.js";import{F as o}from"./index-D-AYJ3bw.js";import"./chunk-GKIRU5P2-B6ZqBHrn.js";import"./index-DCYoqd6f.js";import"./throttle-CnyNgHA9.js";import"./TextArea-B2nks7hq.js";import"./colors-D_r1Oo9l.js";import"./index-BqT3UfUb.js";var F=`.mp-change-container {
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
`,P=()=>{let m=N(),{t:a}=_(),{Text:c,Link:p}=S,[s,n]=i.useState(!1),l=k(),[d,u]=i.useState(!0),{run:g,loading:h}=C(t=>B(t).then(r=>{if(!r)throw new Error("Master password decryption error");return r}),{manual:!0,onSuccess:t=>{f()},onError:t=>{(t==null?void 0:t.message)==="Master password decryption error"?n(!0):l.error((t==null?void 0:t.message)||"check master password error")}}),f=()=>{m("/account/master-password",{state:{setNewMasterPassword:!0}})},x=t=>{let{password:r}=t;r&&r.length>=6&&r.length<=20?g(r):n(!0)},w=t=>{n(!1);let{password:r}=t;u(!r)},E=()=>{m("/account/master-password/description")};return e.createElement("div",{className:"mp-change-container"},e.createElement("style",null,F),e.createElement(y,{displayBackBtn:!0},a("account.current_master_password")),e.createElement("div",{className:"wapper"},e.createElement(o,{onFinish:x,layout:"vertical",onValuesChange:w},e.createElement("div",{className:"scroll-content"},e.createElement("div",{className:"mp-input-name padding-top-16"},a("account.input_master_password")),e.createElement(o.Item,{name:"password"},e.createElement(v,{className:"mp-input"})),s&&e.createElement("div",{className:"mp-input-error"},a("account.password_error")),e.createElement(T,{direction:"vertical",className:"mp-tip-space"},e.createElement(c,null,a("account.mpc_tss_intro")),e.createElement(c,null,a("account.input_decrypt_hint")," ",e.createElement(p,{onClick:E,className:"more-text-btn"},a("account.learn_more_period"))))),e.createElement(o.Item,null,e.createElement("div",{className:"bottom-container"},e.createElement(M,{className:"primary-antd-btn mp-next",htmlType:"submit",loading:h,disabled:d},a("common.next")),e.createElement(b,null))))))},G=P;export{G as default};
