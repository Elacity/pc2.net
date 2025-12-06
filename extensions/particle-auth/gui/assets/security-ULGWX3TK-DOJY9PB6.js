import{z as R}from"./chunk-YV2QPNMZ-BTVn5vT5.js";import{C as z}from"./chunk-PHADJY2T-BVIU49Tr.js";import{d as p}from"./chunk-YNAB6HVU-D07fsIHr.js";import{p as Y}from"./chunk-TT34D6R6-CSYLhXsf.js";import{$ as B,aw as Z,r as l,Y as q,ax as K,ay as W,an as X,az as ee,aA as te,a0 as C,aB as j,a4 as e,aC as M,a5 as P,ac as ae,ad as ce,ae as oe,af as ne,ag as re,ah as ie,ai as $,aj as le,ak as se,al as ue,aa as me,a9 as de,aD as pe,aE as ve,aF as he,ap as ye,aG as be,aH as ge,ao as T}from"./index-AMRqCd9_.js";var xe=`.bind-security-account-prompt .ant-modal-content {
  padding: 18px;
}
.bind-security-account-prompt .bind-hint-content {
  margin: 30px 0;
  font-weight: 500;
  font-size: 18px;
  text-align: center;
  color: var(--text-color);
}
.bind-security-account-prompt .prompt-bottom-btn-box {
  display: flex;
  gap: 16px;
}
`,we=v=>{let{visible:h,setVisible:m,onBind:y}=v,{t:s}=B(),{authCoreModal:a}=ye(),n=()=>{m(!1)};return e.createElement(e.Fragment,null,e.createElement("style",null,P(xe)),e.createElement(be,{className:"bind-security-account-prompt",open:h,maskClosable:!1,onCancel:n,closeIcon:e.createElement(ge,null),centered:!0,zIndex:1e3,getContainer:()=>a.rootBody},e.createElement("div",{className:"bind-hint-content"},s("account.security_account_bind_hint")),e.createElement("div",{className:"prompt-bottom-btn-box"},e.createElement(T,{className:"primary-antd-btn secondary particle-cancel-button",onClick:n},s("common.cancel")),e.createElement(T,{className:"primary-antd-btn",onClick:()=>{m(!1),y()}},s("common.bind")))))},fe=we,_e=`.account-and-security {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  height: 100%;
  overflow: hidden;
}
.account-and-security .scroll-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding-bottom: 0;
  overflow-y: auto;
}
.account-and-security .scroll-content .category-title {
  align-self: flex-start;
  margin-top: 8px;
  margin-left: calc(5% + 12px);
  font-weight: bold;
  font-size: 14px;
  line-height: 16px;
  color: var(--text-color);
}
.account-and-security .hover {
  cursor: pointer;
}
.account-and-security .hover:hover {
  opacity: var(--hover-opacity);
}
.account-and-security .label-item-switch {
  box-shadow: none !important;
  transform: scale(0.98);
}
.account-and-security .label-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-top: 20px;
}
.account-and-security .label-item .arrow-right-icon {
  color: var(--text-color);
}
.account-and-security .label-item .arrow-right-icon svg {
  width: 11px;
  height: 11px;
}
.account-and-security .label-item .label-item-name {
  font-weight: 400;
  font-size: 14px;
  line-height: 16px;
  color: var(--text-color);
}
.account-and-security .label-item .label-item-btn {
  min-width: 44px;
  height: 22px;
  padding: 0 13px;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 500;
  font-size: 14px;
  line-height: 22px;
  text-align: center;
  white-space: nowrap;
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  opacity: 1;
  cursor: pointer;
}
.account-and-security .label-item .label-item-btn:hover {
  opacity: var(--hover-opacity);
}
.account-and-security .footer-tips {
  position: absolute;
  bottom: 50px;
  font-weight: 400;
  font-size: 14px;
  line-height: 24px;
  text-align: center;
  color: var(--text-color);
}
.account-and-security .title {
  position: sticky;
  z-index: 1;
  top: 0;
  width: 100vw;
  padding-top: 18px;
  font-weight: 500;
  font-size: 18px;
  text-align: center;
  color: var(--text-color);
  background: var(--theme-background-color);
  background-color: var(--bg-color);
}
@media (min-width: 600px) {
  .account-and-security .title {
    width: calc(100 * var(--vw));
  }
}
.account-and-security .payment-security {
  box-sizing: border-box;
  width: 90%;
  padding: 14px;
  margin-top: 18px;
  margin-bottom: 0;
  border-radius: var(--card-border-radius);
  background-color: var(--card-unclickable-background-color);
}
.account-and-security .payment-security h3 {
  margin-bottom: 12px;
  font-weight: bold;
  font-size: 14px;
  line-height: 16px;
  color: var(--text-color);
}
.account-and-security .payment-security p {
  box-sizing: border-box;
  padding-right: 20px;
  font-weight: 400;
  font-size: 14px;
  line-height: 18px;
  color: var(--secondary-text-color);
  opacity: 1;
}
.account-and-security .authorization-item {
  margin-bottom: 20px;
}
.account-and-security .authorization-item .label-item {
  height: 36px;
  margin: 0;
}
.account-and-security .master-password-item {
  width: 90%;
  padding: 14px;
  margin-top: 18px;
  border-radius: var(--card-border-radius);
  background-color: var(--card-unclickable-background-color);
}
.account-and-security .master-password-item .mp-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.account-and-security .master-password-item .mp-header .mp-title {
  font-weight: bold;
  font-size: 14px;
  line-height: 16px;
  color: var(--text-color);
}
.account-and-security .master-password-item .mp-header .mp-learn-more {
  font-weight: 500;
  font-size: 14px;
  line-height: 16px;
  color: var(--accent-color);
  cursor: pointer;
}
.account-and-security .master-password-item .mp-content {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.account-and-security .master-password-item .mp-content .mp-desc {
  flex-shrink: 1;
  box-sizing: border-box;
  font-weight: 400;
  font-size: 14px;
  line-height: 18px;
  color: var(--secondary-text-color);
  opacity: 1;
}
.account-and-security .master-password-item .mp-content .mp-set {
  flex-shrink: 0;
  min-width: 44px;
  height: 22px;
  padding: 0 13px;
  margin-left: 16px;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 500;
  font-size: 14px;
  line-height: 22px;
  text-align: center;
  white-space: nowrap;
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  opacity: 1;
  cursor: pointer;
}
.account-and-security .master-password-item .mp-content .mp-set:hover {
  opacity: var(--hover-opacity);
}
.account-and-security .verification-security {
  box-sizing: border-box;
  width: 90%;
  padding: 14px;
  margin-top: 18px;
  border-radius: var(--card-border-radius);
  background-color: var(--card-unclickable-background-color);
}
.account-and-security .verification-security h3 {
  margin-bottom: 12px;
  font-weight: bold;
  font-size: 14px;
  line-height: 16px;
  color: var(--text-color);
}
.account-and-security .verification-security p {
  box-sizing: border-box;
  padding-right: 20px;
  font-weight: 400;
  font-size: 14px;
  line-height: 18px;
  color: var(--secondary-text-color);
  opacity: 1;
}
.account-and-security .account-box {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 90%;
  padding: 22px 12px;
  margin-top: 18px;
  border-radius: var(--card-border-radius);
  background-color: var(--card-unclickable-background-color);
}
.account-and-security .account-box .account-avatar {
  width: 20px;
  height: 20px;
  margin-right: 11px;
  border-radius: 50%;
  background-color: #efefef;
}
.account-and-security .account-box .account {
  flex-grow: 1;
  margin-right: 10px;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color);
}
.account-and-security .account-box .more-account {
  font-weight: 500;
  font-size: 14px;
  text-align: end;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--accent-color);
  cursor: pointer;
}
`,Ee=()=>{var v,h,m,y,s;let{t:a}=B(),n=Z(),[S,b]=l.useState(!1),{setPaymentVerify:A,showSelectSecurityAccount:U,setPaymentPassword:V}=q(),{userInfo:t}=K(),{modalOptions:I}=W(),g=X(),x=l.useMemo(()=>ee(),[t]),w=o=>{var c;return((c=t==null?void 0:t.thirdparty_user_info)==null?void 0:c.provider)===C.jwt?o==null?void 0:o.replace(`${I.projectId}:`,""):o},D={email:de,phone:me,facebook:ue,google:se,apple:le,twitter:$,twitterv1:$,discord:ie,github:re,twitch:ne,microsoft:oe,linkedin:ce,jwt:ae,telegram:R},u=l.useMemo(()=>{var o;let c=te();return c||(c=((o=t==null?void 0:t.thirdparty_user_info)==null?void 0:o.provider)||"email"),c==="twitterv1"&&(c=C.twitter),c},[t]),F=l.useMemo(()=>{var o,c,r,i;let d="";return u&&t&&(d=t[`${u}`]||t[`${u}_email`]||j(w(t[`${u}_id`]))),d||(t==null?void 0:t.email)||(t==null?void 0:t.phone)||((c=(o=t==null?void 0:t.thirdparty_user_info)==null?void 0:o.user_info)==null?void 0:c.email)||j(w(((i=(r=t==null?void 0:t.thirdparty_user_info)==null?void 0:r.user_info)==null?void 0:i.id)||""))},[u,t]),f=o=>{var c,r,i,d,N,k;(c=t==null?void 0:t.security_account)!=null&&c.email&&!((r=t==null?void 0:t.security_account)!=null&&r.phone)||!((i=t==null?void 0:t.security_account)!=null&&i.email)&&((d=t==null?void 0:t.security_account)!=null&&d.phone)?n("/account/verify",{state:{account:((N=t==null?void 0:t.security_account)==null?void 0:N.email)||((k=t.security_account)==null?void 0:k.phone),authType:o,redirectUrl:"/account/security",pageType:"verify_security_account_set_security_account"}}):n("/account/bind",{state:{accountType:o,redirectUrl:"/account/security"}})},H=()=>{var o,c,r,i;(o=t==null?void 0:t.security_account)!=null&&o.email&&((c=t==null?void 0:t.security_account)!=null&&c.phone)?U(!0):n("/account/set-password",{state:{account:((r=t==null?void 0:t.security_account)==null?void 0:r.email)||((i=t==null?void 0:t.security_account)==null?void 0:i.phone)}})},L=()=>{A({visible:!0,type:"close",onVerifyCompleted:o=>{he(o).then(c=>{g.success(a("account.close_success")),M()}).catch(c=>{c.message&&g.error(c.message)})}})},_=l.useMemo(()=>!0,[]),G=()=>{n(-1)},J=()=>{n("/account/master-password/change")},O=()=>{n("/account/master-password")},Q=()=>{n("/account/master-password/description")},E=l.useMemo(()=>{var o,c;return((o=t==null?void 0:t.security_account)==null?void 0:o.email)||((c=t==null?void 0:t.security_account)==null?void 0:c.phone)},[(v=t==null?void 0:t.security_account)==null?void 0:v.email,(h=t==null?void 0:t.security_account)==null?void 0:h.phone]);return l.useEffect(()=>{M().catch(o=>{})},[]),e.createElement("div",{className:"account-and-security"},e.createElement("style",null,P(_e)),_&&e.createElement(z,{onBack:G},a("account.account_and_security")),!_&&e.createElement(z,null,a("account.account_and_security")),e.createElement("div",{className:"scroll-content"},e.createElement("div",{className:"category-title"},a("account.account")),e.createElement("div",{className:"account-box"},e.createElement("img",{className:"account-avatar",src:D[u]}),e.createElement("div",{className:"account"},F),e.createElement("div",{className:"more-account",onClick:()=>{E?n("/login-account"):b(!0)}},a("account.more_login_account"))),e.createElement("div",{className:"payment-security authorization-item"},e.createElement("div",{className:"label-item hover",onClick:()=>{n("/manageDevices/deviceList")}},e.createElement("div",{className:"label-item-name"},a("new.authorization")),e.createElement(p,{className:"arrow-right-icon",name:"arrow_right_icon"}))),e.createElement("div",{className:"category-title"},a("account.security")),e.createElement("div",{className:"master-password-item"},e.createElement("div",{className:"mp-header"},e.createElement("div",{className:"mp-title"},a("account.master_password")),e.createElement("div",{className:"mp-learn-more",onClick:Q},a("account.learn_more"))),e.createElement("div",{className:"mp-content"},e.createElement("div",{className:"mp-desc"},a("account.master_password_tip")),!x&&e.createElement("div",{className:"mp-set",onClick:O},a("account.set"))),x&&e.createElement("div",{className:"label-item hover",onClick:J},e.createElement("div",{className:"label-item-name"},a("account.change_master_password")),e.createElement(p,{className:"arrow-right-icon",name:"arrow_right_icon"}))),e.createElement("div",{className:"verification-security"},e.createElement("h3",null,a("account.verification_security")),e.createElement("p",null,a("account.verification_security_tip")),e.createElement("div",{className:"label-item"},e.createElement("div",{className:"label-item-name"},a("account.email")),pe(((m=t==null?void 0:t.security_account)==null?void 0:m.email)||"")||e.createElement("div",{className:"label-item-btn",onClick:()=>f("email")},a("account.set"))),e.createElement("div",{className:"label-item"},e.createElement("div",{className:"label-item-name"},a("account.mobile")),ve(((y=t==null?void 0:t.security_account)==null?void 0:y.phone)||"")||e.createElement("div",{className:"label-item-btn",onClick:()=>f("phone")},a("account.set")))),e.createElement("div",{className:"payment-security"},e.createElement("h3",null,a("account.payment_security")),e.createElement("p",null,a("account.payment_password_hint")),(s=t==null?void 0:t.security_account)!=null&&s.has_set_payment_password?e.createElement(e.Fragment,null,e.createElement("div",{className:"label-item hover",onClick:()=>n("/account/change-password")},e.createElement("div",{className:"label-item-name"},a("account.change_payment_password")),e.createElement(p,{className:"arrow-right-icon",name:"arrow_right_icon"})),e.createElement("div",{className:"label-item hover",onClick:H},e.createElement("div",{className:"label-item-name"},a("account.forgot_payment_password")),e.createElement(p,{className:"arrow-right-icon",name:"arrow_right_icon"})),e.createElement("div",{className:"label-item hover",onClick:L},e.createElement("div",{className:"label-item-name"},a("account.close_payment_password")),e.createElement(p,{className:"arrow-right-icon",name:"arrow_right_icon"}))):e.createElement("div",{className:"label-item"},e.createElement("div",{className:"label-item-name"},a("account.payment_password")),e.createElement("div",{className:"label-item-btn",onClick:()=>{E?V():b(!0)}},a("account.set"))))),e.createElement(Y,{className:"footer-box-v2"}),e.createElement(fe,{visible:S,setVisible:b,onBind:()=>{n("/account/bind",{state:{accountType:t!=null&&t.email?"phone":"email",showSwitch:!0,redirectUrl:"/account/security"}})}}))},Me=Ee;export{Me as default};
