import{Q as u}from"./chunk-ZQ2O7W7T-BSyOpIFK.js";import{E as N}from"./chunk-T2UATGYS-BQxRF0Fl.js";import{p as w}from"./chunk-GKIRU5P2-B6ZqBHrn.js";import{Z as P,W as S,r as o,o as e,y as z,at as C}from"./index-CaXbrBtJ.js";import{u as j}from"./useRequest-BnTYF8DM.js";import"./chunk-CHA6AH7V-Bh_Ms4Al.js";import"./index-DCYoqd6f.js";import"./throttle-CnyNgHA9.js";var y=`.set-password-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow: hidden;
  color: var(--text-color);
}
.set-password-container .display-none {
  display: none;
}
.set-password-container .password-mistake {
  width: 100%;
  height: auto;
  padding-bottom: 20px;
  margin-top: 50px;
  text-align: center;
  color: var(--error-color);
}
.set-password-container .payment-title {
  margin-top: 60px;
  font-size: 22px;
  color: var(--text-color);
}
.set-password-container .patment-tips1 {
  width: 80vw;
  margin-top: 30px;
  font-size: 14px;
  text-align: center;
  color: var(--text-color);
}
@media (min-width: 600px) {
  .set-password-container .patment-tips1 {
    width: calc(80 * var(--vw));
  }
}
.set-password-container .payment-buttons2 {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: auto;
  margin-top: 50px;
}
.set-password-container .payment-buttons2 .payment-main-button2 {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 90%;
  height: 47px;
  border: none !important;
  border-radius: var(--primary-btn-border-radius);
  outline: none;
  font-weight: 500;
  font-size: var(--primary-btn-font-size);
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  opacity: 1;
}
.set-password-container .payment-buttons2 .payment-main-button2:hover {
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
}
.set-password-container .payment-buttons2 .payment-main-button2:disabled {
  opacity: 0.5;
}
@media (max-width: 565px) {
  .set-password-container .payment-buttons2 {
    height: 47px;
    position: absolute;
    bottom: 262px;
  }
}
.set-password-container .success-icon {
  width: 50px;
  height: 50px;
  margin-top: 60px;
}
.set-password-container .payment-desc-1 {
  box-sizing: border-box;
  margin: 15px 0 0;
  font-weight: 400;
  font-size: 14px;
  line-height: 16px;
  text-align: center;
  color: var(--text-color);
}
.set-password-container .keyboard-container {
  width: 100%;
  padding-right: 30px;
  padding-left: 30px;
  margin-top: 50px;
}
@media (max-width: 565px) {
  .set-password-container .keyboard-container {
    margin-top: 10px;
  }
}
`,W=g=>{let r=P(),{t:n}=S(),a=g,[x,s]=o.useState("loading"),[l,i]=o.useState(""),[d,p]=o.useState(""),[b,m]=o.useState(),[f,c]=o.useState(!1),{errorHandle:h}=N(),{loading:v,run:E}=j(C,{manual:!0,onSuccess:()=>{r(-1)},onError:t=>{h(t),(t==null?void 0:t.error_code)===50104&&(i(""),p(""),m(!1),s("password"))}});o.useEffect(()=>{s("password")},[]);let k=t=>{t.length===6?t===d?(i(t),c(!0)):(i(""),p(""),m(!0),s("password"),c(!1)):(i(t),c(!1))},_=()=>{if(a!=null&&a.account)r("/account/verify",{state:{account:a==null?void 0:a.account,password:l,pageType:"reset_payment_password"}});else if(a!=null&&a.oldPassword){let t=a==null?void 0:a.oldPassword;E({password:l,oldPassword:t})}};return x==="confirm"?e.createElement("div",{className:"set-password-container"},e.createElement("style",null,y),e.createElement(w,{className:"icon-navigation-back",name:"circle_back",onClick:()=>r(-1)}),e.createElement("h2",{className:"payment-title"},n("account.set_payment_password")),e.createElement("p",{className:"payment-desc-1"},n("account.re_enter_confirm")),e.createElement("div",{className:"keyboard-container"},e.createElement(u,{onChange:k,value:l})),e.createElement("div",{className:"payment-buttons2"},e.createElement(z,{className:"payment-main-button2",disabled:!f,loading:a!=null&&a.oldPassword?v:!1,onClick:_},n("account.done")))):e.createElement(e.Fragment,null,e.createElement("style",null,y),e.createElement("div",{className:"set-password-container"},e.createElement(w,{className:"icon-navigation-back",name:"circle_back",onClick:()=>r(-1)}),e.createElement("h2",{className:"payment-title"},n("account.set_payment_password")),e.createElement("p",{className:"payment-desc-1"},n("account.set_payment_password_tip")),e.createElement("div",{className:"keyboard-container"},e.createElement(u,{onChange:t=>{p(t),t.length>5&&(m(!1),c(!1),s("confirm"))},value:d})),b&&e.createElement("div",{className:"password-mistake"},n("account.password_do_not_match"))))},V=W;export{V as default};
