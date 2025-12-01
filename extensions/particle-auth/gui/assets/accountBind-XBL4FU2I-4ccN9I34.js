import{t as J,r as Q}from"./chunk-UD6Q2AOH-DsQGa4dk.js";import{K as X}from"./chunk-Z4EUAXHR-CeuKebht.js";import{p as F}from"./chunk-GKIRU5P2-B6ZqBHrn.js";import{N as q}from"./chunk-CHA6AH7V-Bh_Ms4Al.js";import{Z as D,W as H,x as W,r as o,w as G,z as P,o as n,I as L,y as U,ah as Y,ai as V,e as ee,E as te,H as Z,M,U as ne,p as oe}from"./index-CaXbrBtJ.js";import{u as ae}from"./index-DJfATfeh.js";import{u as K}from"./useRequest-BnTYF8DM.js";import{N as re}from"./throttle-CnyNgHA9.js";import{R as ie}from"./DownOutlined-Cm92TueG.js";import"./index-DCYoqd6f.js";var O=`.set-email-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow: auto;
  color: var(--text-color);
}
.set-email-container .footer-box {
  position: absolute;
  bottom: 10px;
  margin: 0;
}
@media (max-height: 500px) {
  .set-email-container .footer-box {
    display: none;
  }
}
.set-email-container .display-none {
  display: none;
}
.set-email-container .error-tip {
  width: 90%;
  height: 0;
  padding-left: 10px;
  margin-top: 6px;
  margin-bottom: 0;
  text-align: left;
  color: red;
  opacity: 0;
  transition: all 0.3s;
}
.set-email-container .error-tip.show {
  height: 30px;
  opacity: 1;
}
.set-email-container .set-email-title {
  margin-top: 60px;
  font-size: 22px;
  color: var(--text-color);
}
.set-email-container .patment-tips1 {
  width: 80vw;
  margin-top: 30px;
  font-size: 14px;
  text-align: center;
  color: var(--text-color);
}
@media (min-width: 600px) {
  .set-email-container .patment-tips1 {
    width: calc(80 * var(--vw));
  }
}
.set-email-container .set-email-buttons {
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
.set-email-container .success-icon {
  width: 50px;
  height: 50px;
  margin-top: 60px;
}
.set-email-container .set-email-desc-1 {
  box-sizing: border-box;
  padding: 0 18px;
  margin: 15px 0 25px;
  font-weight: 400;
  font-size: 14px;
  line-height: 16px;
  text-align: center;
  color: var(--text-color);
}
.set-email-container .account-input-box {
  position: relative;
  z-index: 3;
  width: 90%;
  height: 47px;
  margin-top: 28px;
  border-radius: var(--primary-btn-border-radius);
  line-height: 47px;
  color: var(--text-color);
  background-color: var(--input-background-color);
  opacity: 1;
}
.set-email-container .account-input-box .account-select-country {
  position: absolute;
  z-index: 2;
  top: 54px;
  left: 2%;
  width: 96%;
  height: 210px;
  border-radius: var(--card-border-radius) !important;
  overflow-y: auto;
  background-color: var(--input-background-color);
}
.set-email-container .account-input-box .account-select-country::-webkit-scrollbar {
  display: none;
  width: 0;
}
.set-email-container .account-input-box .account-select-country .account-select-country-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  height: 47px;
  padding: 5px 0 5px 13px;
  margin: 0;
  border-bottom: 1px solid var(--card-unclickable-background-color);
  font-size: 14px;
  color: var(--text-color);
  cursor: pointer;
}
.set-email-container .account-input-box .account-select-country .account-select-country-item:hover {
  background-color: var(--card-unclickable-background-color);
}
.set-email-container .account-input-box .account-select-country .account-select-country-item div {
  display: flex;
  margin-right: 13px;
}
.set-email-container .account-input-box .account-select-country .account-select-country-item div .country-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.set-email-container .account-input-box input[type='number']::-webkit-inner-spin-button,
.set-email-container .account-input-box input[type='number']::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
.set-email-container .account-input-box.phone {
  display: flex;
  align-items: center;
  border: 1px solid var(--input-background-color);
  border-radius: var(--primary-btn-border-radius);
}
.set-email-container .account-input-box.phone[data-focus='true'] {
  border: 1px solid var(--accent-color) !important;
}
.set-email-container .account-input-box.phone input {
  border: none !important;
}
.set-email-container .account-input-box.phone input:focus {
  border: none !important;
}
.set-email-container .account-input-box .account-select-opt {
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  align-items: center;
  width: 60px;
  height: 100%;
  padding-left: 8px;
  cursor: pointer;
}
.set-email-container .account-input-box .account-select-opt .account-select-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  font-size: 15px;
}
.set-email-container .account-input-box .account-select-opt .down-more {
  margin-left: 8px;
  font-size: 10px;
}
.set-email-container .account-input-box span {
  flex-shrink: 0;
  margin: 0;
  font-size: 15px;
}
.set-email-container .account-input-box input {
  flex-shrink: 1;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 0 15px;
  outline: none;
  font-weight: 400;
  font-size: 15px;
  color: var(--text-color);
  background-color: transparent;
}
.set-email-container .send-code-btn {
  margin-bottom: 0 !important;
}
.set-email-container .account-submit-btn {
  width: 90%;
  height: 47px;
  padding: 0;
  margin-top: 38px;
  border: none;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 500;
  font-size: var(--primary-btn-font-size);
  line-height: 47px;
  text-align: center;
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  opacity: 1;
}
.set-email-container .account-submit-btn.bottom-margin {
  margin-bottom: 100px;
}
.set-email-container .account-submit-btn:hover {
  border: none;
  color: var(--primary-btn-color) !important;
  background: var(--primary-btn-background-color) !important;
  opacity: var(--hover-opacity);
}
.set-email-container .account-switch-item {
  margin-top: 40px;
  font-weight: 500;
  font-size: 13px;
  line-height: 19px;
  color: var(--accent-color);
  cursor: pointer;
}
.set-email-container .set-email-desc-2 {
  min-width: 116px;
  height: 23px;
  padding: 0 15px;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 400;
  font-size: 12px;
  line-height: 23px;
  text-align: center;
  color: var(--secondary-text-color);
  background: var(--tag-background-color);
  opacity: 1;
}
.set-email-container .code-error {
  position: absolute;
  left: calc((100vw - 316px) / 2);
  margin-top: 220px;
  font-weight: 400;
  font-size: 12px;
  color: var(--error-color);
}
@media (min-width: 600px) {
  .set-email-container .code-error {
    left: calc((var(--vw) * 100 - 316px) / 2);
  }
}
.set-email-container .back {
  display: flex;
  align-items: center;
  height: 19px;
  margin-top: 90px;
  margin-bottom: 20px;
  font-weight: 400;
  font-size: 16px;
  line-height: 19px;
  color: var(--accent-color);
  opacity: 1;
  cursor: pointer;
  gap: 8px;
}
.set-email-container .back svg {
  position: relative;
  top: 0;
  color: var(--accent-color);
}
.set-email-container .send-again {
  margin-top: 20px;
  border: none !important;
  outline: none !important;
  font-weight: 400;
  font-size: 16px;
  line-height: 19px;
  color: var(--text-color);
  background-color: transparent;
  box-shadow: none;
}
.set-email-container .send-again:hover {
  color: var(--text-color);
  background-color: transparent !important;
}
.set-email-container .send-again:disabled {
  opacity: 0.5;
}
`,ce=$=>{let{bindAccount:c,backToInputAccount:r,redirectUrl:a="",verifyToken:k=""}=$,A=W(),{t:l}=H(),{themeType:_,language:f}=G(),d=D(),[s,N]=o.useState(""),[C,g]=o.useState(1e3),[i,b]=o.useState(60),[u,x]=o.useState(),B=o.useRef(null),{authCoreModal:I}=P(),[m,v]=o.useState(!1);ae(()=>{if(i>0){let t=i-1;b(t),t===0&&g(void 0)}},C);let{run:h}=K(Y,{manual:!0,onBefore:()=>{v(!0)},onSuccess:t=>{ne(),a?d(a.split("?")[0],{replace:!0,back:!0,state:{...oe.parse(a.split("?")[1]),verifyToken:t==null?void 0:t.token,account:c}}):t.has_set_payment_password?d("/account/security",{replace:!0}):d("/account/set-password")},onError:t=>{(t==null?void 0:t.error_code)===M.InvalidCode?x(l("login.invalid_code")):(t==null?void 0:t.error_code)===M.ResendCode&&x(l("login.please_send_again"))},onFinally:()=>{setTimeout(()=>{v(!1)},2e3)}}),{loading:y,run:w}=K(V,{manual:!0,onSuccess:(t,p)=>{C||(b(60),g(1e3))},onError:t=>{b(0),g(void 0)}}),S=t=>{let p;c.includes("@")?p={email:c,code:t||s}:p={phone:c,code:t||s},k&&(p.token=k),h(p)},z=()=>{x(""),c.includes("@")?w({email:c}):Z({theme:_,language:f,getContainer:()=>I.rootBody}).then(t=>{w({phone:c,cf_turnstile_response:t})}).catch(t=>{A.error(l("error.server_20112"))})},E=t=>{N(t),x(""),t.length===6&&R(t)},R=o.useCallback(re(t=>{S(t)},1e3,{leading:!0,trailing:!1}),[]);o.useEffect(()=>{var t;let p=document.getElementsByClassName("react-input-code"),j=T=>T.preventDefault();return(t=p[0])==null||t.addEventListener("contextmenu",j),()=>{var T;(T=p[0])==null||T.removeEventListener("contextmenu",j)}},[]);let e=()=>{var t;(t=document.getElementsByClassName("input-code-item")[Math.min(s.length,5)])==null||t.focus()};return n.createElement("div",{className:"set-email-container"},n.createElement("style",null,O),n.createElement(F,{className:"icon-navigation-back",name:"circle_back",onClick:r}),n.createElement("h2",{className:"set-email-title"},l("account.enter_code")),n.createElement("p",{className:"set-email-desc-2",style:{margin:20}},c),n.createElement("div",{onClick:e},n.createElement(X,{containerClassName:"react-input-code",inputClassName:"input-code-item",allowedCharacters:"numeric",length:6,ref:B,placeholder:" ",onChange:E})),u&&n.createElement("div",{className:"code-error"},u),n.createElement(U,{disabled:s.length!==6,className:"account-submit-btn",loading:m,onClick:()=>S()},l("common.confirm")),n.createElement(U,{className:"send-again",onClick:z,disabled:i>0||y},i>0?`${l("login.send_again")} (${i}s)`:l("login.send_again")),n.createElement("div",{className:"back",onClick:r},n.createElement(F,{className:"arrow1-icon",name:"arrow1_icon"}),n.createElement("span",null,l("login.back"))),n.createElement(q,null))},le=ce,se=$=>{let c=D(),{t:r}=H(),a=$,k=a==null?void 0:a.redirectUrl,A=a==null?void 0:a.verifyToken,l=W(),_=o.useRef(),[f,d]=o.useState(""),[s,N]=o.useState(["United States","us","1"]),[C,g]=o.useState(!1),i=o.useRef(null),[b,u]=o.useState(""),{themeType:x,language:B}=G(),{authCoreModal:I}=P(),[m,v]=o.useState("email");o.useEffect(()=>{if(m==="phone"||a!=null&&a.showSwitch){let e=J();e&&N(e)}},[m,a==null?void 0:a.showSwitch]);let[h,y]=o.useState(!1);o.useEffect(()=>{if(h)return document.addEventListener("click",w,!0),()=>{document.removeEventListener("click",w,!0)}},[h]);let w=e=>{setTimeout(()=>{var t;(t=_.current)!=null&&t.contains(e.target)||y(!1)})};o.useEffect(()=>{let e=a==null?void 0:a.accountType;e&&v(e)},[a]);let{loading:S,run:z}=K(V,{manual:!0,onSuccess:(e,t)=>{g(e)},onError:e=>{let t=(e==null?void 0:e.error_code)||0;(t===50003||t===50004)&&(d(""),i.current.value="")}}),E=()=>{let e=i.current.value;if(m==="email")if(e){if(!ee.test(e))return u(r("login.email_format_error"))}else return u(r("account.input_vaild_email"));else{let t=s[1].toUpperCase();if(!e&&e!=="0")return u(r("account.input_vaild_mobile"));if(te(e,t))e=`+${s[2]}${e}`;else return u(r("login.phone_format_error"))}d(e),e.includes("@")?z({email:e}):Z({theme:x,language:B,getContainer:()=>I.rootBody}).then(t=>{z({phone:e,cf_turnstile_response:t})}).catch(t=>{l.error(r("error.server_20112"))})},R=()=>{u(""),v(m==="email"?"phone":"email"),d("")};return o.useEffect(()=>{setTimeout(()=>{var e;(e=i.current)==null||e.focus()})},[]),C?n.createElement(le,{bindAccount:f,redirectUrl:k||"",verifyToken:A,backToInputAccount:()=>{g(!1)}}):n.createElement("div",{className:"set-email-container"},n.createElement("style",null,O),n.createElement(F,{className:"icon-navigation-back",name:"circle_back",onClick:()=>c(-1)}),n.createElement("h2",{className:"set-email-title"},r(m==="email"?"account.set_your_email":"account.set_your_mobile")),n.createElement("p",{className:"set-email-desc-1"},r(m==="email"?"account.set_your_email_tip":"account.set_your_mobile_tip")),m==="email"?n.createElement(n.Fragment,null,n.createElement("div",{className:"account-input-box"},n.createElement("input",{onInput:()=>u(""),className:"input_email",type:"email",placeholder:r("account.place_email_address"),ref:i,defaultValue:f,onKeyDown:e=>{e.key==="Enter"&&E()}}))):n.createElement(n.Fragment,null,n.createElement("div",{className:"account-input-box phone",ref:_},h&&n.createElement("div",{className:"account-select-country"},Q.map((e,t)=>n.createElement("p",{key:t,className:"account-select-country-item",onClick:()=>{N(e),y(!1)}},n.createElement("div",{className:"country-box"},n.createElement("div",{className:"country-flag"},L(`${e[1]}`)),n.createElement("span",{className:"country-name"},e[0])),n.createElement("div",{className:"country-code"},"+"+e[2])))),n.createElement("div",{className:"account-select-opt",onClick:()=>y(!h)},n.createElement("div",{className:"account-select-icon"},L(`${s[1]}`)),n.createElement(ie,{className:"down-more"})),n.createElement("span",null,"+",s[2]),n.createElement("input",{onInput:()=>{var e;u(""),i.current.value=((e=i.current.value.match(/^\d+/))==null?void 0:e[0])||""},type:"text",className:"no-number dd",placeholder:r("account.mobile"),ref:i,onWheel:e=>e.target.blur(),defaultValue:f.replace(`+${s[2]}`,""),onKeyDown:e=>{e.key==="Enter"&&E()},onFocus:()=>{var e;(e=document.querySelector(".account-input-box.phone"))==null||e.setAttribute("data-focus","true")},onBlur:()=>{var e;(e=document.querySelector(".account-input-box.phone"))==null||e.setAttribute("data-focus","false")}}))),n.createElement("p",{className:`error-tip ${b?"show":""}`},b),n.createElement(U,{className:"send-code-btn account-submit-btn bottom-margin",loading:S,onClick:E},r("login.get_captcha")),(a==null?void 0:a.showSwitch)&&n.createElement("div",{className:"account-switch-item",onClick:R},r(m==="email"?"account.switch_text_mobile":"account.switch_text_email")),n.createElement(q,null))},ye=se;export{ye as default};
