/** Browser login exists only for the existing local development server. */
export async function getLoginCode(development: boolean, browser: boolean, nativeLogin: () => Promise<{ code: string }>): Promise<string> {
  if (browser) {
    if (!development) throw new Error('请在微信小程序中登录后使用')
    // The server still checks APP_ENV, ENABLE_DEV_LOGIN and its WeChat config.
    return 'local-development'
  }
  const { code } = await nativeLogin()
  if (!code) throw new Error('微信登录未完成，请重试')
  return code
}
