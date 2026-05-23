import type { ReactNode } from 'react';

export type TermKey =
  | 'specGroup'
  | 'stockSpecGroup'
  | 'nonStockSpecGroup'
  | 'sharedNonStockSpecGroup'
  | 'sharedSpecGroupBindOptions'
  | 'sku'
  | 'specCombination'
  | 'oneLineDescription'
  | 'sessionVersion'
  | 'closeTable'
  | 'clearTable'
  | 'forceClearTable'
  | 'idempotencyHeader'
  | 'tenant'
  | 'store'
  | 'singleTenant'
  | 'chainTenant'
  | 'primaryStore'
  | 'sharedDataSync'
  | 'goodCategory'
  | 'categoryBadge'
  | 'categorySubtitle'
  | 'brandName';

export type GlossaryEntry = { label: string; description: ReactNode };

export const GLOSSARY: Record<TermKey, GlossaryEntry> = {
  specGroup: {
    label: '规格组',
    description:
      '同一类规格选项的集合，例如「杯型」下有「中杯/大杯」。一个菜品可以配置多个规格组，分为「库存规格组」「非库存规格组」「共享非库存规格组」三种类型。',
  },
  stockSpecGroup: {
    label: '库存规格组',
    description:
      '会参与生成 SKU 的规格组，每种组合都对应一个独立的库存与上下架状态。常用于「杯型」「口味」等会让售卖单元真正不同的维度。',
  },
  nonStockSpecGroup: {
    label: '非库存规格组',
    description:
      '只影响下单价格、不参与生成 SKU 的规格组，常用于「加糖/去冰」「辣度」等仅做加价、不另算库存的选项。库存按 SKU 计算，不会因为这种规格膨胀。',
  },
  sharedNonStockSpecGroup: {
    label: '共享非库存规格组',
    description:
      '在「规格管理」中统一维护、可被多个菜品复用的非库存规格组。例如多款奶茶共用同一套「加糖/去冰」选项，修改一处即可对所有引用菜品生效。',
  },
  sharedSpecGroupBindOptions: {
    label: '关联设置',
    description:
      '当前菜品在引用共享规格组时的个性化覆盖：可针对本菜品禁用部分选项、或覆盖默认规格。其他属性（必选、最少/最多、加价等）仍由共享规格组本身决定。',
  },
  sku: {
    label: 'SKU',
    description:
      '可独立售卖、独立计库存的商品单元。由「库存规格组」的所有启用选项做笛卡尔积自动生成，例如「奶茶 × 中杯」「奶茶 × 大杯」就是两个不同的 SKU。',
  },
  specCombination: {
    label: '规格组合',
    description: '该 SKU 对应的「库存规格组」选项组合，例如「中杯 + 微糖」。系统按启用选项自动拼出，不需要手动维护。',
  },
  oneLineDescription: {
    label: '一句话描述',
    description: '展示在小程序点餐页菜品名下方的简短卖点文案，建议控制在 30 字以内。留空则不展示。',
  },
  sessionVersion: {
    label: '会话版本',
    description:
      '当前桌台会话的递增编号。每次「关台 / 强制清台 / 重置会话」后会 +1，用于区分新旧会话，避免上一桌的客户继续操作下一桌的购物车。',
  },
  closeTable: {
    label: '关台',
    description:
      '正常结束当前桌台会话：将桌台状态置为空闲、清空桌台购物车、结束本次会话。仅当桌台无未完成订单（创建中/已支付/制作中）时才能执行。',
  },
  clearTable: {
    label: '清台',
    description:
      '与「关台」语义一致：把桌台置为空闲、清空购物车、结束当前会话。仅在桌台无未完成订单时可用，操作前需要二次确认。',
  },
  forceClearTable: {
    label: '强制清台',
    description:
      '存在未完成订单时的兜底操作：同样会清空购物车并结束会话（会话版本 +1），但跳过「无未完成订单」检查。属于风险操作，需要二次确认。',
  },
  idempotencyHeader: {
    label: 'X-Request-Id（幂等头）',
    description:
      '请求中携带的唯一标识，服务端会根据它判重，相同 ID 的请求只会真正执行一次。用于退款、下单等不能重复执行的写操作。前端会自动生成，无需人工填写。',
  },
  tenant: {
    label: '租户',
    description:
      '一个独立经营主体（一个商家/品牌）在系统里的身份。一个租户下可以挂多家门店，并按「单店 / 连锁」两种模式经营；账号、计费、数据隔离都以租户为边界。',
  },
  store: {
    label: '门店',
    description: '实际对外营业的实体店面，归属于某个租户。点单、桌台、订单、上下架等业务数据都按门店归集。',
  },
  singleTenant: {
    label: '单店',
    description: '租户类型之一：只经营一家门店，菜单/规格/分类直接维护在这家店上，没有"主店/子店"的概念。',
  },
  chainTenant: {
    label: '连锁',
    description: '租户类型之一：拥有多家门店、共用同一套品牌与共享菜单。共享部分由「主店」维护，再同步给各子店。',
  },
  primaryStore: {
    label: '主店',
    description:
      '连锁租户中负责维护「共享菜单/分类/规格」的源头门店。其他子店通过「共享数据同步」从主店接收最新配置；每个连锁租户有且只有一家主店。',
  },
  sharedDataSync: {
    label: '共享数据同步',
    description:
      '连锁租户把主店的共享配置（菜品、分类、规格组等）推送给各子店的过程。主店改完之后变更会进入待同步队列，触发同步任务后子店配置才会刷新。',
  },
  goodCategory: {
    label: '菜品分类',
    description:
      '菜品所属的栏目（如「招牌」「饮品」「小吃」），用于在小程序点餐页分组展示。每个菜品必须归到一个分类，分类顺序决定点餐页的栏目顺序。',
  },
  categoryBadge: {
    label: '小标签',
    description:
      '小程序点餐页「左侧分类导航」每一项右上角的蓝底白字小气泡。最多 10 个字，超出会截断。常用于「新品」「热卖」等运营点缀，留空则不展示。',
  },
  categorySubtitle: {
    label: '副标题',
    description:
      '小程序点餐页「右侧菜品列表」中每个分类组标题旁的灰色小字。和分类名同行展示，用于补充栏目定位（如「清爽解腻」「每日上新」），最多 50 个字，留空则不展示。',
  },
  brandName: {
    label: '品牌名称',
    description:
      '连锁租户的对外品牌名（如「点点茶」），小程序顶部、菜单页、连锁子店"品牌(门店)"展示等多处都会用到。单店租户对外直接显示门店名称，不使用品牌名。',
  },
};
