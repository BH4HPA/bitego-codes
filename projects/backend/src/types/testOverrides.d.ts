import type COS from 'cos-nodejs-sdk-v5'

declare global {
  var __COS_PUT_OBJECT__:
    | undefined
    | ((p: {
        key: string
        body: Buffer
        contentType: string
        cacheControl?: string
      }) => Promise<{ ETag?: string; Location?: string }>)
  var __COS_CLIENT__: undefined | COS
  var __WX_FETCH__: undefined | typeof fetch
}

export {}
