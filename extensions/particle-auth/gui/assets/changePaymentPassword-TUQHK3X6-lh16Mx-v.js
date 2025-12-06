import{A as d}from"./chunk-JWIG6G2P-B_Xa92WO.js";import{C as x}from"./chunk-PHADJY2T-CD1xkI84.js";import{aw as u,$ as g,r as w,Y as y,a4 as t,a5 as v,bm as f,av as s}from"./index-CsyZTrGZ.js";import{u as h}from"./useRequest-C9jCoPp5.js";import"./chunk-YNAB6HVU-CMkQ0lkk.js";import"./chunk-TT34D6R6-BtI-V1np.js";import"./index-Dwi7Wm0x.js";import"./throttle-DBpv3hDv.js";var b=`.payment-password-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  height: 100%;
  overflow: hidden;
  color: var(--text-color);
}
.payment-password-container > .wrapper {
  padding: 0 30px;
}
.payment-password-container .display-none {
  display: none;
}
.payment-password-container .page-title {
  margin-top: 0px;
  font-size: 22px;
  color: var(--text-color);
  text-align: center;
}
.payment-title {
  margin-top: 60px;
  font-size: 22px;
  color: var(--text-color);
}
.patment-tips1 {
  width: 80vw;
  margin-top: 30px;
  font-size: 14px;
  text-align: center;
  color: var(--text-color);
}
@media (min-width: 600px) {
  .patment-tips1 {
    width: calc(80 * var(--vw));
  }
}
.payment-buttons {
  position: absolute;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  height: auto;
  padding-bottom: 20px;
}
.success-icon {
  width: 50px;
  height: 50px;
  margin-top: 60px;
}
.payment-desc-1 {
  box-sizing: border-box;
  margin: 15px 0 75px;
  font-weight: 400;
  font-size: 14px;
  line-height: 16px;
  text-align: center;
  color: var(--text-color);
}
`,E=z=>{let l=u(),{t:a}=g(),[o,r]=w.useState(""),{setWrongPassword:n}=y(),{loading:p,run:c}=h(f,{manual:!0,onSuccess:(e,i)=>{l("/account/set-password",{state:{oldPassword:o},replace:!0})},onError:e=>{if(r(""),(e==null?void 0:e.error_code)===s.WrongPaymentPassword)n({visible:!0});else if((e==null?void 0:e.error_code)===s.SecurityAccountFrozen){let i=e.extra.seconds||0;n({visible:!0,accountFrozen:{seconds:i}})}}}),m=e=>{r(e),e.length===6&&c(e)};return t.createElement(t.Fragment,null,t.createElement("style",null,v(b)),t.createElement("div",{className:"payment-password-container"},t.createElement(x,{displayBackBtn:!0}),t.createElement("div",{className:"wrapper"},t.createElement("div",{className:"page-title"},a("account.change_payment_password")),t.createElement("p",{className:"payment-desc-1"},a("account.change_enter_payment")),t.createElement(d,{onChange:m,value:o,keyboardInvisible:p}))))},C=E;export{C as default};
