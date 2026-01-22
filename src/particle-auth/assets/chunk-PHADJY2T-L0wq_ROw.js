import{d as p}from"./chunk-YNAB6HVU-BA-TibPS.js";import{aw as s,b6 as m,a4 as e,a5 as u}from"./index-CRQsZryZ.js";var g=`.p-auth-header {
  position: sticky;
  z-index: 99;
  top: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: 60px;
  font-weight: 500;
  font-size: 18px;
  text-align: center;
  color: var(--text-color);
  background-color: var(--theme-background-color);
  opacity: 0.97;
}
.p-auth-header .left {
  position: absolute;
  left: 0;
  min-width: 60px;
  height: 100%;
}
.p-auth-header .left .header-back-btn {
  position: absolute;
  z-index: 100;
  top: 16px;
  left: 16px;
  font-size: 28px;
}
.p-auth-header .middle .info-request {
  position: initial;
  width: auto;
}
.p-auth-header .middle .info-title {
  padding-top: 0;
  margin-top: 4px;
}
.p-auth-header .middle .info-address {
  justify-content: center;
  align-items: center;
  width: 140px;
  padding-top: 2px;
  margin: auto;
  margin-top: 10px;
  text-align: center;
}
.p-auth-header .middle .info-address .copy-icon {
  position: relative;
  top: 1px;
}
.p-auth-header .right {
  position: absolute;
  right: 0;
  min-width: 60px;
  height: 100%;
}
@media (min-width: 600px) {
  .p-auth-header {
    width: calc(100 * var(--vw));
  }
}
`,f=i=>{var n,r;let{children:d,leftContent:l,rightContent:c,onBack:t}=i,{displayBackBtn:a=!1}=i,h=s(),{customRouter:o}=m();return t&&(a=!0),(l||((r=(n=o==null?void 0:o.history)==null?void 0:n.length)!=null?r:0)<=1)&&(a=!1),e.createElement("div",{className:"width-100"},e.createElement("style",null,u(g)),e.createElement("div",{className:"p-auth-header"},e.createElement("div",{className:"left"},e.createElement(e.Fragment,null,a&&e.createElement(p,{className:"header-back-btn",name:"circle_back",onClick:()=>{t?t():h(-1)}}),l)),e.createElement("div",{className:"middle"},d),e.createElement("div",{className:"right"},c)))},b=f;export{b as C};
