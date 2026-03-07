import {
  Alert,
  Button,
  Card,
  Grid,
  Input,
  Message,
  Radio,
  Space,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { useMemo, useState } from 'react';
import { publicApi } from '../api/public';
import type {
  PublicWhitelistApplicationDraft,
  ResolvedSteamProfile,
  WhitelistApplicationHistory,
  WhitelistStatus,
} from '../types';
import { getErrorMessage } from '../utils/error';

const Row = Grid.Row;
const Col = Grid.Col;

const createEmptyDraft = (): PublicWhitelistApplicationDraft => ({
  nickname: '',
  steamIdentifier: '',
  contact: '',
  note: '',
});

const statusTextMap: Record<WhitelistStatus, string> = {
  approved: '已通过',
  pending: '待审核',
  rejected: '已拒绝',
};

const statusColorMap: Record<WhitelistStatus, 'green' | 'orange' | 'red'> = {
  approved: 'green',
  pending: 'orange',
  rejected: 'red',
};

const sourceTextMap = {
  application: '玩家申请',
  manual: '管理员录入',
} as const;

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
  }).format(new Date(value));
};

const renderProfileField = (label: string, value?: string) => (
  <div className="detail-item">
    <Typography.Text type="secondary" className="detail-item-label">
      {label}
    </Typography.Text>
    <Typography.Paragraph style={{ marginBottom: 0, wordBreak: 'break-all' }}>{value || '-'}</Typography.Paragraph>
  </div>
);

export const PublicWhitelistApplyPage = () => {
  const [draft, setDraft] = useState<PublicWhitelistApplicationDraft>(createEmptyDraft);
  const [resolvedProfile, setResolvedProfile] = useState<ResolvedSteamProfile | null>(null);
  const [historyInfo, setHistoryInfo] = useState<WhitelistApplicationHistory | null>(null);
  const [ownershipConfirmed, setOwnershipConfirmed] = useState<'' | 'yes' | 'no'>('');
  const [resolving, setResolving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const historySummary = useMemo(() => {
    if (!historyInfo) {
      return null;
    }

    return {
      total: historyInfo.records.length,
      approved: historyInfo.records.filter((record) => record.status === 'approved').length,
      pending: historyInfo.records.filter((record) => record.status === 'pending').length,
      rejected: historyInfo.records.filter((record) => record.status === 'rejected').length,
    };
  }, [historyInfo]);

  const handleResolveProfile = async () => {
    if (!draft.steamIdentifier?.trim()) {
      Message.warning('请输入 SteamID64、SteamID、SteamID3 或个人资料链接');
      return;
    }

    setResolving(true);

    try {
      const profile = await publicApi.resolveSteamProfile(draft.steamIdentifier);
      setResolvedProfile(profile);
      setOwnershipConfirmed('');
      setDraft((currentDraft) => ({
        ...currentDraft,
        steamIdentifier: currentDraft.steamIdentifier?.trim() ?? '',
        nickname: '',
      }));

      try {
        const history = await publicApi.getWhitelistHistory(profile.steamId);
        setHistoryInfo(history);

        if (history.duplicateBlocked) {
          Message.warning(history.blockReason || '该 Steam 账号暂不允许重复提交');
        } else if (history.historyHint) {
          Message.info(history.historyHint);
        } else {
          Message.success('已查询到 Steam 玩家信息，请确认是否为本人');
        }
      } catch (historyError) {
        setHistoryInfo(null);
        Message.warning(getErrorMessage(historyError, '已查询到玩家信息，但历史记录加载失败，提交时后端仍会进行重复校验'));
      }
    } catch (error) {
      setResolvedProfile(null);
      setHistoryInfo(null);
      setOwnershipConfirmed('');
      Message.error(getErrorMessage(error, 'Steam 玩家信息查询失败'));
    } finally {
      setResolving(false);
    }
  };

  const handleSubmitApplication = async () => {
    if (!resolvedProfile) {
      Message.warning('请先查询并确认 Steam 玩家信息');
      return;
    }

    if (historyInfo?.duplicateBlocked) {
      Message.warning(historyInfo.blockReason || '该 Steam 账号暂不允许重复提交');
      return;
    }

    if (ownershipConfirmed !== 'yes') {
      Message.warning('请确认查询到的玩家确实是本人后再提交申请');
      return;
    }

    if (!draft.nickname?.trim()) {
      Message.warning('请确认或填写游戏名称');
      return;
    }

    setSubmitting(true);

    try {
      await publicApi.createWhitelistApplication({
        ...draft,
        nickname: draft.nickname.trim(),
        steamIdentifier: draft.steamIdentifier.trim(),
      });
      Message.success('白名单申请已提交，当前状态为待审核');
      setDraft(createEmptyDraft());
      setResolvedProfile(null);
      setHistoryInfo(null);
      setOwnershipConfirmed('');
    } catch (error) {
      Message.error(getErrorMessage(error, '白名单申请提交失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="第一步：查询 Steam 玩家信息">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                content="支持 SteamID64、SteamID、SteamID3 或 Steam 个人资料链接。后端会自动转换并查询游戏名称。"
              />

              <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                <Input
                  size="large"
                  value={draft.steamIdentifier}
                  placeholder="例如：7656119xxxxxxxxxx / STEAM_1:1:123456 / https://steamcommunity.com/id/xxx"
                  onChange={(value) => {
                    setDraft((currentDraft) => ({ ...currentDraft, steamIdentifier: value }));
                    setResolvedProfile(null);
                    setHistoryInfo(null);
                    setOwnershipConfirmed('');
                  }}
                  onPressEnter={() => {
                    void handleResolveProfile();
                  }}
                />
                <Button type="primary" size="large" loading={resolving} onClick={() => void handleResolveProfile()}>
                  查询玩家信息
                </Button>
              </Space>

              {resolvedProfile ? (
                <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                  <div className="detail-grid">
                    {renderProfileField('游戏名称', resolvedProfile.nickname)}
                    {renderProfileField('SteamID64', resolvedProfile.steamId64)}
                    {renderProfileField('SteamID', resolvedProfile.steamId)}
                    {renderProfileField('SteamID3', resolvedProfile.steamId3)}
                    {renderProfileField('资料链接', resolvedProfile.profileUrl)}
                  </div>

                  <Card title="第二步：确认是否为本人">
                    <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                      <Radio.Group
                        type="button"
                        value={ownershipConfirmed}
                        onChange={(value) => {
                          const nextValue = value as '' | 'yes' | 'no';
                          setOwnershipConfirmed(nextValue);
                          if (nextValue === 'yes') {
                            setDraft((currentDraft) => ({
                              ...currentDraft,
                              nickname: resolvedProfile.nickname,
                            }));
                          }
                        }}
                      >
                        <Radio value="yes">是本人</Radio>
                        <Radio value="no">不是本人</Radio>
                      </Radio.Group>
                      {ownershipConfirmed === 'yes' ? (
                        <Alert type="success" showIcon content="已自动将查询到的游戏名称填入下方表单。" />
                      ) : null}
                      {ownershipConfirmed === 'no' ? (
                        <Alert type="warning" showIcon content="请确认输入的 Steam 标识是否正确；若不是本人，请勿继续提交。" />
                      ) : null}
                    </Space>
                  </Card>
                </Space>
              ) : null}
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="第三步：提交白名单申请">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                content="提交后会进入后台白名单管理的待审核列表，管理员审核后会在白名单公示中显示结果。"
              />

              <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                <div>
                  <Typography.Text style={{ display: 'block', marginBottom: 8 }}>游戏名称</Typography.Text>
                  <Input
                    size="large"
                    value={draft.nickname}
                    placeholder="确认本人后会自动填入，也可手动调整"
                    onChange={(value) => {
                      setDraft((currentDraft) => ({ ...currentDraft, nickname: value }));
                    }}
                  />
                </div>

                <div>
                  <Typography.Text style={{ display: 'block', marginBottom: 8 }}>联系方式（可选）</Typography.Text>
                  <Input
                    size="large"
                    value={draft.contact}
                    placeholder="可填写 QQ、Discord、邮箱等，便于管理员联系"
                    onChange={(value) => {
                      setDraft((currentDraft) => ({ ...currentDraft, contact: value }));
                    }}
                  />
                </div>

                <div>
                  <Typography.Text style={{ display: 'block', marginBottom: 8 }}>申请说明（可选）</Typography.Text>
                  <Input.TextArea
                    autoSize={{ minRows: 4, maxRows: 8 }}
                    value={draft.note}
                    placeholder="若存在历史被拒绝记录，建议在这里补充当前变更情况或说明"
                    onChange={(value) => {
                      setDraft((currentDraft) => ({ ...currentDraft, note: value }));
                    }}
                  />
                </div>
              </Space>

              <Space wrap>
                {resolvedProfile ? <Tag color="green">已解析 Steam 信息</Tag> : <Tag color="orange">等待解析 Steam 信息</Tag>}
                {ownershipConfirmed === 'yes' ? <Tag color="green">已确认本人</Tag> : <Tag color="red">未完成本人确认</Tag>}
                {historyInfo?.duplicateBlocked ? <Tag color="red">已触发重复申请拦截</Tag> : null}
              </Space>

              <Button
                type="primary"
                size="large"
                long
                loading={submitting}
                disabled={Boolean(historyInfo?.duplicateBlocked)}
                onClick={() => void handleSubmitApplication()}
              >
                提交申请
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {historyInfo ? (
        <Card title="同 SteamID 历史申请提示">
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {historyInfo.duplicateBlocked ? (
              <Alert type="error" showIcon content={historyInfo.blockReason || '该 Steam 账号暂不允许重复申请'} />
            ) : historyInfo.historyHint ? (
              <Alert type="warning" showIcon content={historyInfo.historyHint} />
            ) : (
              <Alert type="success" showIcon content="当前未发现同 SteamID 的历史申请记录，可以正常提交。" />
            )}

            <Space wrap>
              <Tag color="purple">{historyInfo.steamId64}</Tag>
              <Tag color="arcoblue">{historyInfo.steamId}</Tag>
              <Tag color="cyan">{historyInfo.steamId3}</Tag>
              {historySummary ? <Tag>历史记录 {historySummary.total}</Tag> : null}
              {historySummary?.approved ? <Tag color="green">已通过 {historySummary.approved}</Tag> : null}
              {historySummary?.pending ? <Tag color="orange">待审核 {historySummary.pending}</Tag> : null}
              {historySummary?.rejected ? <Tag color="red">已拒绝 {historySummary.rejected}</Tag> : null}
            </Space>

            {historyInfo.records.length > 0 ? (
              <Row gutter={[16, 16]}>
                {historyInfo.records.map((record) => (
                  <Col key={record.id} xs={24} xl={12}>
                    <Card
                      title={
                        <Space wrap>
                          <Typography.Text style={{ fontWeight: 700 }}>{record.nickname}</Typography.Text>
                          <Tag color={statusColorMap[record.status]}>{statusTextMap[record.status]}</Tag>
                          <Tag>{sourceTextMap[record.source]}</Tag>
                        </Space>
                      }
                      extra={<Typography.Text type="secondary">{formatTime(record.appliedAt)}</Typography.Text>}
                    >
                      <div className="detail-grid">
                        {renderProfileField('申请时间', formatTime(record.appliedAt))}
                        {renderProfileField('审核时间', formatTime(record.reviewedAt))}
                        {renderProfileField('状态', statusTextMap[record.status])}
                        {renderProfileField('来源', sourceTextMap[record.source])}
                        {renderProfileField('联系方式', record.contact || '-')}
                        {renderProfileField('备注/说明', record.note || '-')}
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            ) : null}
          </Space>
        </Card>
      ) : null}
    </Space>
  );
};
