import {
  Alert,
  Button,
  Card,
  Drawer,
  Grid,
  Input,
  InputNumber,
  Message,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { IconPlus } from '@arco-design/web-react/icon';
import { useMemo, useState } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';
import type { BanRecord, BanRecordUpdateDraft, BanStatus, BanType, ManualBanDraft } from '../types';
import {
  banSourceLabelMap,
  banStatusColorMap,
  banStatusLabelMap,
  banTypeLabelMap,
  getBanDurationLabel,
  getBanExpiresAt,
  getBanTypeDescription,
} from '../utils/ban';
import { getErrorMessage } from '../utils/error';
import { STEAM_PENDING_TEXT } from '../utils/steam';
import { websiteAdminRoleColorMap, websiteAdminRoleLabelMap } from '../utils/websiteAdmin';

const { Row, Col } = Grid;
const Option = Select.Option;

type BanFormMode = 'create' | 'edit';
type ConfirmAction = 'revoke' | 'delete';

const createEmptyBanDraft = (): BanRecordUpdateDraft => ({
  nickname: '',
  banType: 'steam_account',
  steamIdentifier: '',
  ipAddress: '',
  reason: '',
  serverName: '',
  communityName: '',
});

const createBanDraftFromRecord = (record: BanRecord): BanRecordUpdateDraft => ({
  nickname: record.nickname ?? '',
  banType: record.banType,
  steamIdentifier: record.steamIdentifier,
  ipAddress: record.ipAddress ?? '',
  durationSeconds: record.durationSeconds,
  reason: record.reason,
  serverName: record.serverName === '手动录入（未关联服务器）' ? '' : record.serverName,
  communityName: record.communityName ?? '',
});

const formatTime = (value?: string) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
};

const validateBanDraft = (draft: BanRecordUpdateDraft) => {
  const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

  if (!draft.steamIdentifier.trim()) {
    return '请输入玩家 Steam 标识';
  }

  if (draft.ipAddress?.trim() && !ipv4Pattern.test(draft.ipAddress.trim())) {
    return '玩家 IP 格式不正确';
  }

  if (draft.durationSeconds !== undefined && draft.durationSeconds < 1) {
    return '封禁秒数必须大于 0';
  }

  if (!draft.reason.trim()) {
    return '请输入封禁原因';
  }

  return null;
};

const renderDetailItem = (label: string, value: string) => (
  <div className="detail-item">
    <Typography.Text type="secondary" className="detail-item-label">
      {label}
    </Typography.Text>
    <Typography.Text>{value}</Typography.Text>
  </div>
);

export const BanManagementPage = () => {
  const { state, manualBanPlayer, updateBanRecord, revokeBanRecord, deleteBanRecord, apiMode, apiError, bootstrapping } =
    useAppStore();
  const [banTypeFilter, setBanTypeFilter] = useState<'all' | BanType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | BanStatus>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | BanRecord['source']>('all');
  const [keyword, setKeyword] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<BanFormMode>('create');
  const [formDraft, setFormDraft] = useState<BanRecordUpdateDraft>(createEmptyBanDraft);
  const [durationMode, setDurationMode] = useState<'permanent' | 'temporary'>('permanent');
  const [editingBanId, setEditingBanId] = useState<string | null>(null);
  const [detailBanId, setDetailBanId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ action: ConfirmAction; banId: string } | null>(null);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [submittingConfirm, setSubmittingConfirm] = useState(false);

  const detailBan = useMemo(() => state.bans.find((ban) => ban.id === detailBanId) ?? null, [detailBanId, state.bans]);
  const confirmBan = useMemo(
    () => state.bans.find((ban) => ban.id === confirmTarget?.banId) ?? null,
    [confirmTarget?.banId, state.bans],
  );

  const summary = useMemo(() => {
    const total = state.bans.length;
    const active = state.bans.filter((ban) => ban.status === 'active').length;
    const revoked = state.bans.filter((ban) => ban.status === 'revoked').length;
    const pendingFill = state.bans.filter(
      (ban) => !ban.nickname || !ban.ipAddress || ban.steamId64 === STEAM_PENDING_TEXT,
    ).length;

    return {
      total,
      active,
      revoked,
      pendingFill,
    };
  }, [state.bans]);

  const filteredBans = useMemo(() => {
    const search = keyword.trim().toLowerCase();

    return state.bans.filter((ban) => {
      const matchesType = banTypeFilter === 'all' ? true : ban.banType === banTypeFilter;
      const matchesStatus = statusFilter === 'all' ? true : ban.status === statusFilter;
      const matchesSource = sourceFilter === 'all' ? true : ban.source === sourceFilter;
      const matchesKeyword =
        !search ||
        (ban.nickname ?? '').toLowerCase().includes(search) ||
        ban.steamIdentifier.toLowerCase().includes(search) ||
        ban.steamId64.toLowerCase().includes(search) ||
        ban.steamId.toLowerCase().includes(search) ||
        ban.steamId3.toLowerCase().includes(search) ||
        (ban.ipAddress ?? '').toLowerCase().includes(search) ||
        ban.reason.toLowerCase().includes(search) ||
        ban.serverName.toLowerCase().includes(search) ||
        (ban.communityName ?? '').toLowerCase().includes(search) ||
        ban.operatorName.toLowerCase().includes(search) ||
        (ban.revokedByOperatorName ?? '').toLowerCase().includes(search);

      return matchesType && matchesStatus && matchesSource && matchesKeyword;
    });
  }, [banTypeFilter, keyword, sourceFilter, state.bans, statusFilter]);

  const columns = [
    {
      title: '玩家信息',
      dataIndex: 'nickname',
      render: (_value: string, record: BanRecord) => (
        <Space direction="vertical" size="mini">
          <Typography.Text style={{ fontWeight: 600 }}>{record.nickname || '待后端匹配玩家名称'}</Typography.Text>
          <Typography.Text type="secondary">SteamID64：{record.steamId64}</Typography.Text>
          <Typography.Text type="secondary">SteamID：{record.steamId}</Typography.Text>
          <Typography.Text type="secondary">SteamID3：{record.steamId3}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (value: BanStatus) => <Tag color={banStatusColorMap[value]}>{banStatusLabelMap[value]}</Tag>,
    },
    {
      title: '封禁属性',
      dataIndex: 'banType',
      width: 150,
      render: (value: BanType) => <Tag color={value === 'ip' ? 'purple' : 'red'}>{banTypeLabelMap[value]}</Tag>,
    },
    {
      title: '封禁信息',
      dataIndex: 'reason',
      render: (_value: string, record: BanRecord) => (
        <Space direction="vertical" size="mini">
          <Typography.Text>{record.reason}</Typography.Text>
          <Typography.Text type="secondary">时长：{getBanDurationLabel(record.durationSeconds)}</Typography.Text>
          <Typography.Text type="secondary">IP：{record.ipAddress ?? '等待玩家下次进服自动回填'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '所在服务器',
      dataIndex: 'serverName',
      width: 220,
      render: (_value: string, record: BanRecord) => (
        <Space direction="vertical" size="mini">
          <Typography.Text>{record.serverName}</Typography.Text>
          <Typography.Text type="secondary">{record.communityName ?? '未关联社区'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '执行管理员',
      dataIndex: 'operatorName',
      width: 180,
      render: (_value: string, record: BanRecord) => (
        <Space direction="vertical" size="mini">
          <Typography.Text style={{ fontWeight: 600 }}>{record.operatorName}</Typography.Text>
          <Tag color={websiteAdminRoleColorMap[record.operatorRole]}>{websiteAdminRoleLabelMap[record.operatorRole]}</Tag>
        </Space>
      ),
    },
    {
      title: '记录时间',
      dataIndex: 'bannedAt',
      width: 210,
      render: (_value: string, record: BanRecord) => (
        <Space direction="vertical" size="mini">
          <Typography.Text>封禁：{formatTime(record.bannedAt)}</Typography.Text>
          <Typography.Text type="secondary">更新：{formatTime(record.updatedAt)}</Typography.Text>
        </Space>
      ),
      sorter: (a: BanRecord, b: BanRecord) => a.bannedAt.localeCompare(b.bannedAt),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: '操作',
      dataIndex: 'id',
      width: 260,
      render: (_value: string, record: BanRecord) => (
        <Space wrap>
          <Button size="small" onClick={() => setDetailBanId(record.id)}>
            详情
          </Button>
          <Button size="small" onClick={() => {
            setFormMode('edit');
            setEditingBanId(record.id);
            setFormDraft(createBanDraftFromRecord(record));
            setDurationMode(record.durationSeconds ? 'temporary' : 'permanent');
            setFormVisible(true);
          }}>
            编辑
          </Button>
          {record.status === 'active' ? (
            <Button size="small" status="warning" onClick={() => setConfirmTarget({ action: 'revoke', banId: record.id })}>
              解除封禁
            </Button>
          ) : record.source === 'server_action' ? (
            <Button size="small" status="warning" onClick={() => setConfirmTarget({ action: 'revoke', banId: record.id })}>
              重试解封同步
            </Button>
          ) : null}
          <Button size="small" status="danger" onClick={() => setConfirmTarget({ action: 'delete', banId: record.id })}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const openCreateModal = () => {
    setFormMode('create');
    setEditingBanId(null);
    setFormDraft(createEmptyBanDraft());
    setDurationMode('permanent');
    setFormVisible(true);
  };

  const closeFormModal = () => {
    setFormVisible(false);
    setFormMode('create');
    setEditingBanId(null);
    setFormDraft(createEmptyBanDraft());
    setDurationMode('permanent');
  };

  const handleSubmitBan = async () => {
    const nextDraft: BanRecordUpdateDraft = {
      ...formDraft,
      durationSeconds: durationMode === 'temporary' ? Number(formDraft.durationSeconds ?? 0) : undefined,
    };
    const errorMessage = validateBanDraft(nextDraft);

    if (errorMessage) {
      Message.warning(errorMessage);
      return;
    }

    setSubmittingForm(true);

    try {
      if (formMode === 'create') {
        const createDraft: ManualBanDraft = {
          nickname: nextDraft.nickname,
          banType: nextDraft.banType,
          steamIdentifier: nextDraft.steamIdentifier,
          ipAddress: nextDraft.ipAddress,
          durationSeconds: nextDraft.durationSeconds,
          reason: nextDraft.reason,
        };

        await manualBanPlayer(createDraft);
        Message.success('封禁记录已添加');
      } else {
        if (!editingBanId) {
          throw new Error('未找到要编辑的封禁记录');
        }

        await updateBanRecord(editingBanId, nextDraft);
        Message.success('封禁记录已更新');
      }

      closeFormModal();
    } catch (error) {
      Message.error(getErrorMessage(error, formMode === 'create' ? '手动添加封禁失败' : '编辑封禁失败'));
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmTarget || !confirmBan) {
      setConfirmTarget(null);
      return;
    }

    setSubmittingConfirm(true);

    try {
      if (confirmTarget.action === 'revoke') {
        await revokeBanRecord(confirmTarget.banId);
        Message.success(
          confirmBan.status === 'revoked'
            ? `已重新同步 ${confirmBan.nickname ?? confirmBan.steamId} 的本地解封`
            : `已解除 ${confirmBan.nickname ?? confirmBan.steamId} 的封禁`,
        );
      } else {
        await deleteBanRecord(confirmTarget.banId);
        Message.success('封禁记录已删除');

        if (detailBanId === confirmTarget.banId) {
          setDetailBanId(null);
        }
      }

      setConfirmTarget(null);
    } catch (error) {
      Message.error(getErrorMessage(error, confirmTarget.action === 'revoke' ? '解除封禁失败' : '删除封禁失败'));
    } finally {
      setSubmittingConfirm(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card className="page-header-card">
        <Space direction="vertical" size="large" className="page-header-stack">
          <div className="page-toolbar">
            <div className="page-toolbar-copy">
              <Typography.Title className="page-toolbar-title" heading={4}>
                封禁管理
              </Typography.Title>
              <Typography.Paragraph className="page-toolbar-description" type="secondary">
                统一记录封禁玩家，并支持手动添加、编辑封禁、解除封禁和删除封禁记录。
              </Typography.Paragraph>
            </div>

            <div className="page-toolbar-actions">
              <Tag color="red">生效中 {summary.active}</Tag>
              <Tag color="gray">已解除 {summary.revoked}</Tag>
              <Tag color="orange">待回填 {summary.pendingFill}</Tag>
              <Button type="primary" icon={<IconPlus />} onClick={openCreateModal}>
                手动添加封禁
              </Button>
            </div>
          </div>

          <Alert
            type="info"
            showIcon
            content={`当前共有 ${summary.total} 条封禁记录，其中生效中 ${summary.active} 条，已解除 ${summary.revoked} 条。当前接口模式：${apiMode === 'http' ? 'HTTP API' : 'Mock API'}${bootstrapping ? '，正在加载…' : ''}`}
          />

          {apiError ? <Alert type="warning" showIcon content={`接口提示：${apiError}`} /> : null}
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">封禁总数</Typography.Text>
            <Typography.Title heading={3}>{summary.total}</Typography.Title>
            <Typography.Text>包含服务器封禁与手动录入</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">生效中</Typography.Text>
            <Typography.Title heading={3}>{summary.active}</Typography.Title>
            <Typography.Text>当前仍在限制玩家进入</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">已解除</Typography.Text>
            <Typography.Title heading={3}>{summary.revoked}</Typography.Title>
            <Typography.Text>保留历史记录用于审计</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="metric-card">
            <Typography.Text type="secondary">待回填信息</Typography.Text>
            <Typography.Title heading={3}>{summary.pendingFill}</Typography.Title>
            <Typography.Text>等待后端匹配名称或补全 IP</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Card className="section-card" title="筛选条件">
        <Space direction="vertical" size="medium" style={{ width: '100%' }}>
          <Typography.Text type="secondary">可按封禁属性、状态、来源以及关键词快速筛选记录。</Typography.Text>
          <div className="page-toolbar">
            <Space wrap className="toolbar-action-group">
              <Select value={banTypeFilter} style={{ width: 180 }} onChange={(value) => setBanTypeFilter(value)}>
                <Option value="all">全部封禁属性</Option>
                <Option value="steam_account">Steam账号封禁</Option>
                <Option value="ip">IP封禁</Option>
              </Select>
              <Select value={statusFilter} style={{ width: 160 }} onChange={(value) => setStatusFilter(value)}>
                <Option value="all">全部状态</Option>
                <Option value="active">生效中</Option>
                <Option value="revoked">已解除</Option>
              </Select>
              <Select value={sourceFilter} style={{ width: 180 }} onChange={(value) => setSourceFilter(value)}>
                <Option value="all">全部来源</Option>
                <Option value="server_action">服务器内封禁</Option>
                <Option value="manual">管理员手动添加</Option>
              </Select>
            </Space>
            <div className="toolbar-search-group">
              <Input.Search
                className="toolbar-search-input"
                allowClear
                placeholder="搜索玩家、Steam 标识、IP、封禁原因、服务器或管理员"
                value={keyword}
                onChange={setKeyword}
              />
            </div>
          </div>
        </Space>
      </Card>

      <Card className="table-card" title="封禁列表" extra={<Tag color="arcoblue">当前 {filteredBans.length} 条</Tag>}>
        <Table rowKey="id" columns={columns} data={filteredBans} pagination={{ pageSize: 8 }} />
      </Card>

      <Modal
        title={formMode === 'create' ? '手动添加封禁' : '编辑封禁'}
        visible={formVisible}
        confirmLoading={submittingForm}
        onOk={() => {
          void handleSubmitBan();
        }}
        onCancel={closeFormModal}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            content={
              formMode === 'create'
                ? '玩家名称可留空，后端后续可按 Steam 标识自动匹配玩家名称；Steam 标识支持 SteamID、SteamID64 或 Steam 社区链接。'
                : '编辑封禁时可调整封禁属性、Steam 标识、IP、时长、原因和服务器信息。'
            }
          />

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>玩家名称（可选）</Typography.Text>
            <Input
              allowClear
              placeholder="不填写时后续由后端自动匹配"
              value={formDraft.nickname}
              onChange={(value) => setFormDraft((draft) => ({ ...draft, nickname: value }))}
            />
          </Space>

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>封禁属性</Typography.Text>
            <Radio.Group
              type="button"
              value={formDraft.banType}
              onChange={(value) => setFormDraft((draft) => ({ ...draft, banType: value as BanType }))}
            >
              <Radio value="steam_account">Steam账号封禁</Radio>
              <Radio value="ip">IP封禁</Radio>
            </Radio.Group>
            <Typography.Text type="secondary">{getBanTypeDescription(formDraft.banType)}</Typography.Text>
          </Space>

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>Steam 标识</Typography.Text>
            <Input
              allowClear
              placeholder="支持 SteamID / SteamID64 / Steam 社区链接"
              value={formDraft.steamIdentifier}
              onChange={(value) => setFormDraft((draft) => ({ ...draft, steamIdentifier: value }))}
            />
          </Space>

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>玩家 IP（可选）</Typography.Text>
            <Input
              allowClear
              placeholder="不填写时，后端可在玩家下次进服后自动补全"
              value={formDraft.ipAddress}
              onChange={(value) => setFormDraft((draft) => ({ ...draft, ipAddress: value }))}
            />
          </Space>

          {formMode === 'edit' ? (
            <>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Typography.Text>所在服务器（可选）</Typography.Text>
                <Input
                  allowClear
                  placeholder="例如：Skyline #3 Fastcup"
                  value={formDraft.serverName}
                  onChange={(value) => setFormDraft((draft) => ({ ...draft, serverName: value }))}
                />
              </Space>

              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Typography.Text>所属社区（可选）</Typography.Text>
                <Input
                  allowClear
                  placeholder="例如：Skyline Climb 社区"
                  value={formDraft.communityName}
                  onChange={(value) => setFormDraft((draft) => ({ ...draft, communityName: value }))}
                />
              </Space>
            </>
          ) : null}

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>封禁时长</Typography.Text>
            <Radio.Group
              type="button"
              value={durationMode}
              onChange={(value) => {
                const nextMode = value as 'permanent' | 'temporary';
                setDurationMode(nextMode);
                setFormDraft((draft) => ({
                  ...draft,
                  durationSeconds: nextMode === 'temporary' ? draft.durationSeconds ?? 600 : undefined,
                }));
              }}
            >
              <Radio value="permanent">永久封禁</Radio>
              <Radio value="temporary">自定义秒数</Radio>
            </Radio.Group>
          </Space>

          {durationMode === 'temporary' ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Typography.Text>封禁秒数</Typography.Text>
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                value={formDraft.durationSeconds}
                onChange={(value) => setFormDraft((draft) => ({ ...draft, durationSeconds: Number(value ?? 0) }))}
              />
            </Space>
          ) : null}

          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>封禁原因</Typography.Text>
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 5 }}
              placeholder="请输入封禁原因"
              value={formDraft.reason}
              onChange={(value) => setFormDraft((draft) => ({ ...draft, reason: value }))}
            />
          </Space>
        </Space>
      </Modal>

      <Modal
        title={confirmTarget?.action === 'revoke' ? (confirmBan?.status === 'revoked' ? '重试解封同步' : '解除封禁') : '删除封禁记录'}
        visible={Boolean(confirmTarget)}
        confirmLoading={submittingConfirm}
        okButtonProps={{ status: confirmTarget?.action === 'delete' ? 'danger' : 'warning' }}
        onOk={() => {
          void handleConfirmAction();
        }}
        onCancel={() => setConfirmTarget(null)}
      >
        <Typography.Text>
          {confirmTarget?.action === 'revoke'
            ? confirmBan?.status === 'revoked'
              ? `确认重新同步 ${confirmBan?.nickname ?? confirmBan?.steamId ?? '该玩家'} 在游戏服上的本地解封吗？这会再次调用服务器的 sm_unban。`
              : `确认解除 ${confirmBan?.nickname ?? confirmBan?.steamId ?? '该玩家'} 的封禁吗？解除后将保留历史记录。`
            : `确认删除 ${confirmBan?.nickname ?? confirmBan?.steamId ?? '该记录'} 的封禁记录吗？删除后将无法恢复。`}
        </Typography.Text>
      </Modal>

      <Drawer
        title={detailBan ? `封禁详情 · ${detailBan.nickname || detailBan.steamId}` : '封禁详情'}
        width={720}
        visible={Boolean(detailBan)}
        onCancel={() => setDetailBanId(null)}
      >
        {detailBan ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Space size="small" wrap>
              <Tag color={detailBan.banType === 'ip' ? 'purple' : 'red'}>{banTypeLabelMap[detailBan.banType]}</Tag>
              <Tag color={banStatusColorMap[detailBan.status]}>{banStatusLabelMap[detailBan.status]}</Tag>
              <Tag color="arcoblue">{banSourceLabelMap[detailBan.source]}</Tag>
              <Tag color={websiteAdminRoleColorMap[detailBan.operatorRole]}>{websiteAdminRoleLabelMap[detailBan.operatorRole]}</Tag>
            </Space>

            <div className="detail-grid">
              {renderDetailItem('玩家名称', detailBan.nickname || '待后端匹配玩家名称')}
              {renderDetailItem('原始封禁标识', detailBan.steamIdentifier)}
              {renderDetailItem('SteamID64', detailBan.steamId64)}
              {renderDetailItem('SteamID', detailBan.steamId)}
              {renderDetailItem('SteamID3', detailBan.steamId3)}
              {renderDetailItem('IP', detailBan.ipAddress || '等待玩家下次进服自动回填')}
              {renderDetailItem('封禁原因', detailBan.reason)}
              {renderDetailItem('封禁时长', getBanDurationLabel(detailBan.durationSeconds))}
              {renderDetailItem('封禁时间', formatTime(detailBan.bannedAt))}
              {renderDetailItem('最近更新时间', formatTime(detailBan.updatedAt))}
              {renderDetailItem('预计结束时间', formatTime(getBanExpiresAt(detailBan.bannedAt, detailBan.durationSeconds)))}
              {renderDetailItem('所在服务器', detailBan.serverName)}
              {renderDetailItem('所属社区', detailBan.communityName || '未关联社区')}
              {renderDetailItem('执行管理员', detailBan.operatorName)}
              {renderDetailItem('管理员角色', websiteAdminRoleLabelMap[detailBan.operatorRole])}
              {renderDetailItem('解除时间', formatTime(detailBan.revokedAt))}
              {renderDetailItem('解除管理员', detailBan.revokedByOperatorName || '-')}
            </div>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
};
