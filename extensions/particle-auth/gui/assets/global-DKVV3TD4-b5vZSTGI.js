var o=`.particle-auth-core-shadow-root {
  overflow: hidden;
  font-family: var(--auth-core-font-family);
  color: var(--text-color);
}
.particle-auth-core-shadow-root input:-webkit-autofill,
.particle-auth-core-shadow-root input:-webkit-autofill:hover,
.particle-auth-core-shadow-root input:-webkit-autofill:focus,
.particle-auth-core-shadow-root textarea:-webkit-autofill,
.particle-auth-core-shadow-root textarea:-webkit-autofill:hover,
.particle-auth-core-shadow-root textarea:-webkit-autofill:focus,
.particle-auth-core-shadow-root select:-webkit-autofill,
.particle-auth-core-shadow-root select:-webkit-autofill:hover,
.particle-auth-core-shadow-root select:-webkit-autofill:focus {
  font-size: 15px;
  box-shadow: 0 0 0 100px transparent inset;
  transition: background-color 5000s ease-in-out 0s;
  caret-color: var(--text-color);
  -webkit-text-fill-color: var(--text-color);
}
.particle-auth-core-shadow-root button,
.particle-auth-core-shadow-root input,
.particle-auth-core-shadow-root optgroup,
.particle-auth-core-shadow-root select,
.particle-auth-core-shadow-root textarea {
  font-family: var(--auth-core-font-family);
}
.particle-auth-core-shadow-root .icon-navigation-back {
  position: absolute;
  z-index: 99;
  top: 16px;
  left: 16px;
  font-size: 28px;
}
.particle-auth-core-shadow-root .close-iframe {
  position: absolute;
  z-index: 100;
  top: 16px;
  right: 16px;
}
.particle-auth-core-shadow-root .close-iframe.top-hint {
  top: 75px;
}
.particle-auth-core-shadow-root .dark {
  color: var(--text-color);
}
.particle-auth-core-shadow-root .dark .info-sign .btn-box {
  background-color: var(--card-unclickable-background-color);
}
.particle-auth-core-shadow-root .dark .info-sign .risk-reminder {
  background-color: var(--card-unclickable-background-color);
}
.particle-auth-core-shadow-root .dark .ant-message-notice-content {
  color: var(--text-color);
  background: var(--modal-background-color);
}
.particle-auth-core-shadow-root .hidden {
  display: none;
}
.particle-auth-core-shadow-root .pre-wrap {
  white-space: pre-wrap;
}
.particle-auth-core-shadow-root .hide-hover {
  --hover-opacity: 1 !important;
}
.particle-auth-core-shadow-root ::selection {
  color: #fff;
  background-color: var(--accent-color);
}
.particle-auth-core-shadow-root .ant-btn,
.particle-auth-core-shadow-root .ant-btn.ant-btn-variant-solid:not(:disabled):not(.ant-btn-disabled) {
  padding: 3px 15px;
  border: none;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 500 !important;
  font-size: var(--primary-btn-font-size);
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  gap: 4px;
}
.particle-auth-core-shadow-root .ant-btn:hover,
.particle-auth-core-shadow-root .ant-btn.ant-btn-variant-solid:not(:disabled):not(.ant-btn-disabled):hover {
  border: none;
  opacity: var(--hover-opacity);
}
.particle-auth-core-shadow-root .ant-btn:active .particle-auth-core-shadow-root .ant-btn:focus,
.particle-auth-core-shadow-root .ant-btn:active .particle-auth-core-shadow-root .ant-btn.ant-btn-variant-solid:not(:disabled):not(.ant-btn-disabled):focus,
.particle-auth-core-shadow-root .ant-btn.ant-btn-variant-solid:not(:disabled):not(.ant-btn-disabled):active .particle-auth-core-shadow-root .ant-btn:focus,
.particle-auth-core-shadow-root .ant-btn.ant-btn-variant-solid:not(:disabled):not(.ant-btn-disabled):active .particle-auth-core-shadow-root .ant-btn.ant-btn-variant-solid:not(:disabled):not(.ant-btn-disabled):focus {
  border: none;
}
.particle-auth-core-shadow-root .ant-btn:disabled,
.particle-auth-core-shadow-root .ant-btn.ant-btn-variant-solid:not(:disabled):not(.ant-btn-disabled):disabled {
  opacity: var(--disable-opacity);
  pointer-events: none;
}
.particle-auth-core-shadow-root .ant-btn:disabled span,
.particle-auth-core-shadow-root .ant-btn.ant-btn-variant-solid:not(:disabled):not(.ant-btn-disabled):disabled span {
  opacity: var(--disable-opacity);
}
.particle-auth-core-shadow-root .ant-modal-confirm-btns {
  margin-top: 24px;
  text-align: right;
}
.particle-auth-core-shadow-root .ant-modal-confirm-btns .ant-btn {
  margin-left: 12px;
}
.particle-auth-core-shadow-root .ant-modal-confirm-btns .ant-btn,
.particle-auth-core-shadow-root .ant-modal-confirm-btns .ant-btn-variant-outlined:not(:disabled):not(.ant-btn-disabled) {
  padding-right: 18px;
  padding-left: 18px;
  border: none;
  border-radius: var(--primary-btn-border-radius);
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
}
.particle-auth-core-shadow-root .ant-modal-content {
  border: none !important;
  border-radius: var(--modal-border-radius) !important;
  background-color: var(--modal-background-color) !important;
  padding: 0 !important;
}
.particle-auth-core-shadow-root .ant-modal-content .ant-modal-header {
  background: none;
}
.particle-auth-core-shadow-root .ant-modal-content .ant-modal-confirm-title {
  color: var(--text-color) !important;
}
.particle-auth-core-shadow-root .ant-modal-confirm .ant-modal-content {
  padding: 0;
}
.particle-auth-core-shadow-root .ant-modal-confirm-body .anticon-close-circle {
  color: #ff4d4f;
  font-size: 18px;
  float: left;
  margin-right: 16px;
  position: relative;
  top: 3px;
}
.particle-auth-core-shadow-root .ant-modal-confirm-body .ant-modal-confirm-paragraph {
  display: block;
  overflow: hidden;
  color: rgba(0, 0, 0, 0.85);
  font-weight: 500;
  font-size: 16px;
  line-height: 1.4;
}
.particle-auth-core-shadow-root .ant-modal-confirm-body .ant-modal-confirm-content {
  color: var(--text-color);
}
.particle-auth-core-shadow-root .ant-drawer-content-wrapper {
  width: 100%;
  max-width: 100% !important;
  box-shadow: none !important;
}
.particle-auth-core-shadow-root .ant-drawer-content {
  border-radius: var(--modal-border-radius) var(--modal-border-radius) 0 0;
  background-color: var(--theme-background-color) !important;
}
.particle-auth-core-shadow-root .ant-form {
  color: var(--text-color);
}
.particle-auth-core-shadow-root .ant-form-item-explain-error {
  color: var(--error-color);
}
.particle-auth-core-shadow-root .ant-input-status-error:not(.ant-input-disabled, .ant-input-borderless).ant-input,
.particle-auth-core-shadow-root .ant-input-status-error:not(.ant-input-disabled, .ant-input-borderless).ant-input:hover {
  border-color: var(--error-color);
}
.particle-auth-core-shadow-root .ant-message {
  z-index: 9999999;
}
.particle-auth-core-shadow-root .ant-message-notice-content {
  padding: 0;
  border-radius: var(--primary-btn-border-radius);
  overflow: hidden;
  font-weight: 500;
  box-shadow: 0 1px 15px rgba(0, 0, 0, 0.15);
}
.particle-auth-core-shadow-root .ant-message-notice-content .ant-message-custom-content {
  padding: 10px 16px;
  color: #fff;
}
.particle-auth-core-shadow-root .react-input-code {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}
.particle-auth-core-shadow-root .react-input-code .input-code-item {
  width: 44px;
  height: 44px;
  padding: 0;
  margin-right: 6px;
  margin-left: 6px;
  border: transparent;
  border-radius: 12px;
  font-size: 20px;
  text-align: center;
  text-transform: uppercase;
  color: var(--text-color);
  background-clip: padding-box;
  background-color: var(--input-background-color);
  caret-color: var(--text-color);
}
.particle-auth-core-shadow-root .react-input-code .input-code-item:focus {
  appearance: none;
  outline: 0;
}
.particle-auth-core-shadow-root .react-input-code .input-code-item:not(:placeholder-shown) {
  appearance: none;
  outline: 0;
}
.particle-auth-core-shadow-root .react-input-code input:-webkit-autofill,
.particle-auth-core-shadow-root .react-input-code input:-webkit-autofill:hover,
.particle-auth-core-shadow-root .react-input-code input:-webkit-autofill:focus,
.particle-auth-core-shadow-root .react-input-code input:-webkit-autofill:active {
  box-shadow: 0 0 0 60px var(--input-background-color) inset !important;
  -webkit-text-fill-color: var(--text-color) !important;
}
.particle-auth-core-shadow-root .react-input-code .input-code-mask {
  position: absolute;
  z-index: 1;
  width: 100%;
  height: 100%;
}
.particle-auth-core-shadow-root .primary-antd-btn,
.particle-auth-core-shadow-root .primary-antd-btn.ant-btn-variant-outlined {
  width: 100%;
  height: 47px;
  border: none;
  border-radius: var(--primary-btn-border-radius);
  outline: none;
  font-size: var(--primary-btn-font-size);
  line-height: 22px;
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
}
.particle-auth-core-shadow-root .primary-antd-btn:focus, .particle-auth-core-shadow-root .primary-antd-btn:active,
.particle-auth-core-shadow-root .primary-antd-btn.ant-btn-variant-outlined:focus,
.particle-auth-core-shadow-root .primary-antd-btn.ant-btn-variant-outlined:active {
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
}
.particle-auth-core-shadow-root .primary-antd-btn:hover,
.particle-auth-core-shadow-root .primary-antd-btn.ant-btn-variant-outlined:hover {
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  opacity: var(--hover-opacity);
}
.particle-auth-core-shadow-root .primary-antd-btn:disabled,
.particle-auth-core-shadow-root .primary-antd-btn.ant-btn-variant-outlined:disabled {
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  opacity: var(--disable-opacity);
}
.particle-auth-core-shadow-root .primary-antd-btn:disabled span,
.particle-auth-core-shadow-root .primary-antd-btn.ant-btn-variant-outlined:disabled span {
  opacity: var(--disable-opacity);
}
.particle-auth-core-shadow-root .primary-antd-btn.danger,
.particle-auth-core-shadow-root .primary-antd-btn.ant-btn-variant-outlined.danger {
  color: white !important;
  background: var(--error-color) !important;
}
.particle-auth-core-shadow-root .primary-antd-btn.secondary,
.particle-auth-core-shadow-root .primary-antd-btn.ant-btn-variant-outlined.secondary {
  color: var(--secondary-btn-color);
  background: var(--secondary-btn-background-color);
}
.particle-auth-core-shadow-root .primary-antd-btn span,
.particle-auth-core-shadow-root .primary-antd-btn.ant-btn-variant-outlined span {
  font-weight: 500;
}
.particle-auth-core-shadow-root .accent-antd-btn {
  width: 100%;
  height: 47px;
  border: none;
  border-radius: var(--primary-btn-border-radius);
  outline: none;
  font-size: var(--primary-btn-font-size);
  line-height: 22px;
  color: white;
  background-color: var(--accent-color);
}
.particle-auth-core-shadow-root .accent-antd-btn:focus, .particle-auth-core-shadow-root .accent-antd-btn:active {
  color: white;
  background-color: var(--accent-color);
}
.particle-auth-core-shadow-root .accent-antd-btn:hover {
  color: white;
  background-color: var(--accent-color);
  opacity: var(--hover-opacity);
}
.particle-auth-core-shadow-root .accent-antd-btn:disabled {
  color: white;
  background-color: var(--accent-color);
  opacity: var(--disable-opacity);
}
.particle-auth-core-shadow-root .accent-antd-btn span {
  font-weight: 500;
}
.particle-auth-core-shadow-root .theme-font-icon {
  color: var(--text-color);
}
.particle-auth-core-shadow-root .theme-font-icon:hover {
  opacity: var(--hover-opacity);
}
.particle-auth-core-shadow-root .no-number {
  appearance: textfield !important;
}
.particle-auth-core-shadow-root .ant-input-affix-wrapper:focus,
.particle-auth-core-shadow-root .ant-input-affix-wrapper-focused,
.particle-auth-core-shadow-root .ant-input:focus,
.particle-auth-core-shadow-root .ant-radio-input:focus + .ant-radio-inner,
.particle-auth-core-shadow-root .ant-input-focused {
  box-shadow: none;
}
.particle-auth-core-shadow-root .ant-radio-inner {
  border-width: 2px !important;
  border-color: var(--accent-color) !important;
  background: none;
}
.particle-auth-core-shadow-root .ant-radio-inner::after {
  width: 14px;
  height: 14px;
  margin-top: -7px;
  margin-left: -7px;
}
.particle-auth-core-shadow-root .ant-radio-wrapper:hover .ant-radio,
.particle-auth-core-shadow-root .ant-radio:hover .ant-radio-inner,
.particle-auth-core-shadow-root .ant-radio-input:focus + .ant-radio-inner {
  border-color: var(--accent-color) !important;
}
.particle-auth-core-shadow-root .ant-message-error {
  background: var(--error-color);
}
.particle-auth-core-shadow-root .ant-message-error .anticon {
  color: #fff;
}
.particle-auth-core-shadow-root .ant-message-success {
  border: 1px solid var(--green-color);
  overflow: hidden;
  background: var(--green-color);
}
.particle-auth-core-shadow-root .ant-message-success .anticon {
  color: #fff;
}
.particle-auth-core-shadow-root .color-scheme-dark {
  color-scheme: dark;
}
.particle-auth-core-shadow-root .color-scheme-dark iframe {
  color-scheme: none;
}
.particle-auth-core-shadow-root .m-warning-modal .ant-modal-confirm-btns {
  display: none;
}
.particle-auth-core-shadow-root .m-warning-modal .content {
  margin-top: 26px;
  font-weight: 500;
  font-size: 16px;
  line-height: 20px;
  text-align: center;
  color: var(--text-color);
}
.particle-auth-core-shadow-root .m-warning-modal .anticon-exclamation-circle {
  display: none;
}
.particle-auth-core-shadow-root .m-warning-modal .anticon-close {
  color: var(--secondary-text-color);
}
.particle-auth-core-shadow-root .m-warning-modal .footer-btns {
  column-gap: 18px;
  display: flex;
  justify-content: flex-end;
  margin-top: 30px;
}
.particle-auth-core-shadow-root .m-warning-modal .footer-btns .ant-btn {
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
  height: 47px;
  font-weight: 500;
  font-size: 17px;
  line-height: 22px;
  text-align: center;
  color: var(--background-color);
  box-shadow: none !important;
}
.particle-auth-core-shadow-root .m-warning-modal .footer-btns .ant-btn:first-child {
  color: var(--secondary-btn-color);
  background-color: var(--secondary-btn-background-color);
}
.particle-auth-core-shadow-root .m-warning-modal .footer-btns .ant-btn::after {
  display: none !important;
}
.particle-auth-core-shadow-root .m-warning-modal .footer-btns .confirm-btn:hover,
.particle-auth-core-shadow-root .m-warning-modal .footer-btns .confirm-btn:focus,
.particle-auth-core-shadow-root .m-warning-modal .footer-btns .confirm-btn:active {
  color: var(--primary-btn-color);
  background-color: var(--primary-btn-background-color);
}
.particle-auth-core-shadow-root .ant-input {
  padding-right: 14px;
  padding-left: 14px;
}
.particle-auth-core-shadow-root .ant-input:focus {
  border: 1px solid var(--accent-color) !important;
}
.particle-auth-core-shadow-root .ant-input,
.particle-auth-core-shadow-root .input_email,
.particle-auth-core-shadow-root .ant-input-number-input,
.particle-auth-core-shadow-root .account-input-box input {
  border: 1px solid var(--input-background-color);
  border-radius: var(--primary-btn-border-radius);
  transition: none !important;
}
.particle-auth-core-shadow-root .ant-input:focus,
.particle-auth-core-shadow-root .input_email:focus,
.particle-auth-core-shadow-root .ant-input-number-input:focus,
.particle-auth-core-shadow-root .account-input-box input:focus {
  border: 1px solid var(--accent-color) !important;
}
.particle-auth-core-shadow-root .ant-btn-primary,
.particle-auth-core-shadow-root .ant-btn-color-primary,
.particle-auth-core-shadow-root .ant-btn-variant-solid,
.particle-auth-core-shadow-root .ant-btn.ant-btn-variant-solid:not(:disabled):not(.ant-btn-disabled) {
  background-color: var(--primary-btn-background-color);
  box-shadow: none !important;
}
.particle-auth-core-shadow-root .ant-btn-primary:hover,
.particle-auth-core-shadow-root .ant-btn-color-primary:hover,
.particle-auth-core-shadow-root .ant-btn-variant-solid:hover,
.particle-auth-core-shadow-root .ant-btn.ant-btn-variant-solid:not(:disabled):not(.ant-btn-disabled):hover {
  background-color: var(--primary-btn-background-color);
}
.particle-auth-core-shadow-root .ant-tabs .ant-tabs-tab .ant-tabs-tab-btn {
  font-size: 16px;
}
.particle-auth-core-shadow-root .ant-tabs .ant-tabs-ink-bar {
  display: none;
}
.particle-auth-core-shadow-root .more-text-btn {
  color: var(--accent-color) !important;
}
.particle-auth-core-shadow-root input::placeholder {
  color: var(--input-placeholder-color) !important;
}
.particle-auth-core-shadow-root .ant-btn-loading {
  opacity: var(--disable-opacity);
  display: flex !important;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.particle-auth-core-shadow-root .ant-btn-loading span {
  opacity: var(--disable-opacity);
}
.particle-auth-core-shadow-root .ant-btn-loading::before {
  display: none !important;
}
.particle-auth-core-shadow-root .ant-btn-loading .ant-btn-loading-icon {
  width: 20px !important;
  height: 20px !important;
  background-image: var(--loading-icon);
  background-repeat: no-repeat;
  background-position-y: 0px !important;
  background-position-x: 0px !important;
  background-size: 20px 20px;
  opacity: 1;
  transition: initial !important;
  animation: none !important;
}
.particle-auth-core-shadow-root .ant-btn-loading .ant-btn-loading-icon .anticon {
  opacity: 0 !important;
}
.particle-auth-core-shadow-root .ant-modal {
  width: 90%;
  max-width: 340px;
}
.particle-auth-core-shadow-root .ant-modal > [aria-hidden=true] {
  display: none;
  pointer-events: none;
}
.particle-auth-core-shadow-root .ant-modal .ant-modal-body {
  padding: 18px;
}
.particle-auth-core-shadow-root .ant-modal .ant-modal-close-x {
  background: var(--close-icon);
  background-position: 12px 12px;
  background-repeat: no-repeat;
}
.particle-auth-core-shadow-root .ant-modal .ant-modal-close-x .anticon {
  display: none;
}
.particle-auth-core-shadow-root .ant-modal .ant-btn span {
  font-size: var(--primary-btn-font-size);
}
.particle-auth-core-shadow-root input {
  caret-color: var(--accent-color);
}
.particle-auth-core-shadow-root .root-particle-modal-container {
  color: var(--text-color);
  position: fixed !important;
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-modal-close {
  z-index: 999;
  background: none;
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-modal-close:hover {
  background: none;
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-modal-close-x {
  width: 54px;
  height: 54px;
  position: absolute;
  top: 50%;
  right: 50%;
  transform: translate(50%, -50%);
}
.particle-auth-core-shadow-root .root-particle-modal-container > .ant-modal > div {
  overflow: hidden;
  width: 100%;
  height: 100%;
}
.particle-auth-core-shadow-root .root-particle-modal-container > .ant-modal > div > .ant-modal-content {
  width: 100%;
  height: 100%;
  border: none !important;
  border-radius: var(--modal-border-radius) !important;
  overflow: hidden;
  color: var(--text-color);
  background-color: var(--theme-background-color) !important;
  padding: 0 !important;
}
.particle-auth-core-shadow-root .root-particle-modal-container > .ant-modal > div > .ant-modal-content > .ant-modal-body {
  width: 100%;
  height: 100%;
  padding: 0;
  color: var(--text-color);
}
.particle-auth-core-shadow-root .root-particle-modal-container > .ant-modal > div > .ant-modal-content > .ant-modal-body > div[data-path] {
  width: 100%;
  height: 100%;
}
.particle-auth-core-shadow-root .root-particle-modal-container > .ant-modal > div > .ant-modal-content > .ant-modal-body > div[data-path] .lazy-loaing-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}
.particle-auth-core-shadow-root .root-particle-modal-container > .ant-modal > div > .ant-modal-content > .ant-modal-body .ant-drawer {
  width: 100%;
  height: 100%;
}
.particle-auth-core-shadow-root .root-particle-modal-container > .ant-modal > div > .ant-modal-content > .ant-modal-body .ant-drawer .ant-drawer-content-wrapper {
  width: 100% !important;
}
@media (min-width: 600px) {
  .particle-auth-core-shadow-root .root-particle-modal-container > .ant-modal > div > .ant-modal-content > .ant-modal-body .ant-drawer {
    position: absolute;
  }
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-drawer-content-wrapper * {
  overscroll-behavior-y: none;
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-drawer-content-wrapper .ant-drawer-content {
  padding: 0;
  overflow: hidden;
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-drawer-content-wrapper .ant-drawer-content .ant-drawer-body {
  padding: 0;
  padding-top: 17px;
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-drawer-content-wrapper .ant-drawer-content .ant-drawer-body .particle-drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-drawer-content-wrapper .ant-drawer-content .ant-drawer-body .particle-drawer-content .particle-close-btn + div {
  flex: 1;
  overflow: hidden;
}
@media (max-width: 600px) {
  .particle-auth-core-shadow-root .root-particle-modal-container .ant-drawer-content-wrapper .ant-drawer-content .ant-drawer-body {
    padding-top: 0;
  }
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-modal-wrap.auth-core-modal-error > .ant-modal,
.particle-auth-core-shadow-root .root-particle-modal-container .ant-modal-wrap.auth-core-modal-warning > .ant-modal {
  display: block;
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-modal-wrap.auth-core-modal-error .ant-modal-confirm-error,
.particle-auth-core-shadow-root .root-particle-modal-container .ant-modal-wrap.auth-core-modal-warning .ant-modal-confirm-error {
  top: 100px;
  display: block;
  margin: auto;
}
.particle-auth-core-shadow-root .root-particle-modal-container .ant-modal-wrap.auth-core-modal-error .ant-modal-confirm-error .ant-modal-content .ant-modal-body,
.particle-auth-core-shadow-root .root-particle-modal-container .ant-modal-wrap.auth-core-modal-warning .ant-modal-confirm-error .ant-modal-content .ant-modal-body {
  padding: 18px;
}
.particle-auth-core-shadow-root .width-100 {
  width: 100%;
}
.particle-auth-core-shadow-root .still-confirm {
  color: white !important;
  background: var(--error-color) !important;
}
.particle-auth-core-shadow-root .ant-modal-wrap {
  position: absolute;
}
.particle-auth-core-shadow-root .footer-box-v2 {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: var(--footer-height);
  margin: 0 !important;
  background: var(--theme-background-color);
}
.particle-auth-core-shadow-root .footer-box-v2 img {
  width: 167px;
  margin: 0;
}
.particle-auth-core-shadow-root .footer-box-v2,
.particle-auth-core-shadow-root .footer-box {
  padding-bottom: calc(env(safe-area-inset-bottom) / 2);
  box-sizing: border-box;
}
.particle-auth-core-shadow-root .scroll-content {
  flex: 1;
  width: 100%;
  overflow-y: auto;
}
.particle-auth-core-shadow-root .height-100 {
  height: 100%;
}
@media (max-width: 600px) {
  .particle-auth-core-shadow-root .m-margin-top-40 {
    margin-top: 40px !important;
  }
}
@media (max-width: 600px) {
  .particle-auth-core-shadow-root .m-margin-top-20 {
    margin-top: 20px !important;
  }
}
.particle-auth-core-shadow-root .padding-top-16 {
  padding-top: 16px !important;
}`;export{o as default};
