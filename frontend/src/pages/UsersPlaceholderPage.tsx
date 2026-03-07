import {
  Alert,
  Button,
  Card,
  Grid,
  Input,
  List,
  Message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { IconEdit, IconUser } from '@arco-design/web-react/icon';
import { useMemo, useState } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';
import type { WebsiteAdmin, WebsiteAdminUpdateDraft } from '../types';
import { getErrorMessage } from '../utils/error';
import {
  getPermissionSummary,
  systemAdminOnlyFeatures,
  websiteAdminRoleColorMap,
  websiteAdminRoleLabelMap,
} from '../utils/websiteAdmin';

const { Row, Col } = Grid;
const Option = Select.Option;

const createEditDraft = (admin: WebsiteAdmin): WebsiteAdminUpdateDraft => ({
  username: admin.username,
  displayName: admin.displayName,
  password: '',
  email: admin.email ?? '',
  note: admin.note ?? '',
  role: admin.role,
});

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export const UsersPlaceholderPage = () => {
  const { websiteUsers, currentAdmin, updateWebsiteAdmin, apiMode } = useAppStore();
  const [editVisible, setEditVisible] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WebsiteAdminUpdateDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSystemAdmin = currentAdmin?.role === 'system_admin';

  const permissionSummary = useMemo(
    () => (currentAdmin ? getPermissionSummary(currentAdmin.role) : []),
    [currentAdmin],
  );

  const currentAdminRecord = useMemo(
    () => websiteUsers.find((admin) => admin.id === currentAdmin?.id) ?? currentAdmin ?? null,
    [currentAdmin, websiteUsers],
  );

  const openEditModal = (admin: WebsiteAdmin) => {
    setEditingAdminId(admin.id);
    setDraft(createEditDraft(admin));
    setEditVisible(true);
  };

  const closeEditModal = () => {
    setEditVisible(false);
    setEditingAdminId(null);
    setDraft(null);
  };

  const handleSave = async () => {
    if (!editingAdminId || !draft) {
      return;
    }

    setSubmitting(true);

    try {
      await updateWebsiteAdmin(editingAdminId, draft);
      Message.success('管理员信息已更新');
      closeEditModal();
    } catch (error) {
      Message.error(getErrorMessage(error, '管理员信息更新失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: '管理员',
      dataIndex: 'username',
      render: (_value: string, record: WebsiteAdmin) => (
        <Space direction="vertical" size="mini">
          <Space size="small" wrap>
            <Typography.Text style={{ fontWeight: 600 }}>{record.displayName}</Typography.Text>
            {currentAdmin?.id === record.id ? <Tag color="gold">当前账号</Tag> : null}
          </Space>
          <Typography.Text type="secondary">用户名：{record.username}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      render: (value: WebsiteAdmin['role']) => (
        <Tag color={websiteAdminRoleColorMap[value]}>{websiteAdminRoleLabelMap[value]}</Tag>
      ),
    },
    {
      title: '联系信息',
      dataIndex: 'email',
      render: (value?: string) => value || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      render: (value: string) => formatTime(value),
    },
    {
      title: '操作',
      dataIndex: 'id',
      width: 180,
      render: (_value: string, record: WebsiteAdmin) => (
        <Button type="outline" size="small" icon={<IconEdit />} onClick={() => openEditModal(record)}>
          编辑管理员
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title heading={4} style={{ marginBottom: 8 }}>
          网站用户
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          当前已接入真实登录态：系统管理员可编辑全部管理员资料，普通管理员仅可编辑自己的用户名、密码和个人信息。
        </Typography.Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        content={`当前管理员资料与权限来自 Rust 后端真实数据。当前接口模式：${apiMode === 'http' ? 'HTTP API' : 'Mock API'}。`}
      />

      {!isSystemAdmin ? (
        <Alert
          type="warning"
          showIcon
          content="当前以普通管理员身份查看页面：其他管理员管理能力和系统管理员专属功能已隐藏。"
        />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="当前登录账号">
            {currentAdmin ? (
              <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                <Space size="small" wrap>
                  <Typography.Text style={{ fontWeight: 600 }}>{currentAdmin.displayName}</Typography.Text>
                  <Tag color={websiteAdminRoleColorMap[currentAdmin.role]}>
                    {websiteAdminRoleLabelMap[currentAdmin.role]}
                  </Tag>
                </Space>
                <Typography.Text type="secondary">用户名：{currentAdmin.username}</Typography.Text>
                <Typography.Text type="secondary">联系信息：{currentAdmin.email || '-'}</Typography.Text>
                <Typography.Text type="secondary">备注：{currentAdmin.note || '-'}</Typography.Text>
              </Space>
            ) : (
              <Typography.Text type="secondary">当前没有已登录管理员。</Typography.Text>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="当前账号权限">
            <List
              dataSource={permissionSummary}
              render={(item, index) => (
                <List.Item key={item}>
                  <Space>
                    <Tag color={index === 0 ? 'arcoblue' : 'gray'}>权限 {index + 1}</Tag>
                    <Typography.Text>{item}</Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {isSystemAdmin ? (
        <Card title="管理员列表">
          <Table rowKey="id" columns={columns} data={websiteUsers} pagination={false} />
        </Card>
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title="我的信息"
            extra={
              currentAdminRecord ? (
                <Button type="primary" icon={<IconUser />} onClick={() => openEditModal(currentAdminRecord)}>
                  编辑我的信息
                </Button>
              ) : null
            }
          >
            {currentAdminRecord ? (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Space size="small" wrap>
                  <Typography.Text style={{ fontWeight: 600 }}>{currentAdminRecord.displayName}</Typography.Text>
                  <Tag color={websiteAdminRoleColorMap[currentAdminRecord.role]}>
                    {websiteAdminRoleLabelMap[currentAdminRecord.role]}
                  </Tag>
                </Space>
                <Typography.Text>用户名：{currentAdminRecord.username}</Typography.Text>
                <Typography.Text>联系信息：{currentAdminRecord.email || '-'}</Typography.Text>
                <Typography.Text>备注：{currentAdminRecord.note || '-'}</Typography.Text>
                <Typography.Text type="secondary">创建时间：{formatTime(currentAdminRecord.createdAt)}</Typography.Text>
                <Typography.Text type="secondary">更新时间：{formatTime(currentAdminRecord.updatedAt)}</Typography.Text>
              </Space>
            ) : (
              <Typography.Text type="secondary">当前没有可用管理员账号。</Typography.Text>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          {isSystemAdmin ? (
            <Card title="系统管理员专属功能（待开发）">
              <List
                dataSource={systemAdminOnlyFeatures}
                render={(item, index) => (
                  <List.Item key={item}>
                    <Space>
                      <Tag color="red">系统 {index + 1}</Tag>
                      <Typography.Text>{item}</Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          ) : (
            <Card title="普通管理员说明">
              <Space direction="vertical" size="medium">
                <Typography.Text>
                  普通管理员当前仅开放个人资料维护能力，系统管理员专属区和后续系统级功能不会显示在当前视图中。
                </Typography.Text>
                <Typography.Text type="secondary">
                  后续哪些功能对普通管理员不可见，还会根据实际业务继续细化。
                </Typography.Text>
              </Space>
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        title={editingAdminId && currentAdmin?.id === editingAdminId ? '编辑我的信息' : '编辑管理员信息'}
        visible={editVisible}
        confirmLoading={submitting}
        onOk={() => {
          void handleSave();
        }}
        onCancel={closeEditModal}
      >
        {draft ? (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Typography.Text>用户名</Typography.Text>
            <Input
              allowClear
              value={draft.username}
              onChange={(value) => setDraft((currentDraft) => (currentDraft ? { ...currentDraft, username: value } : currentDraft))}
              placeholder="请输入用户名"
            />

            <Typography.Text>管理员名称</Typography.Text>
            <Input
              allowClear
              value={draft.displayName}
              onChange={(value) => setDraft((currentDraft) => (currentDraft ? { ...currentDraft, displayName: value } : currentDraft))}
              placeholder="请输入管理员名称"
            />

            {isSystemAdmin ? (
              <>
                <Typography.Text>角色</Typography.Text>
                <Select
                  value={draft.role}
                  onChange={(value) =>
                    setDraft((currentDraft) => (currentDraft ? { ...currentDraft, role: value } : currentDraft))
                  }
                >
                  <Option value="system_admin">系统管理员</Option>
                  <Option value="normal_admin">普通管理员</Option>
                </Select>
              </>
            ) : null}

            <Typography.Text>联系信息</Typography.Text>
            <Input
              allowClear
              value={draft.email}
              onChange={(value) => setDraft((currentDraft) => (currentDraft ? { ...currentDraft, email: value } : currentDraft))}
              placeholder="请输入邮箱或其他联系方式"
            />

            <Typography.Text>新密码</Typography.Text>
            <Input.Password
              value={draft.password}
              onChange={(value) => setDraft((currentDraft) => (currentDraft ? { ...currentDraft, password: value } : currentDraft))}
              placeholder="留空则保持原密码不变"
            />

            <Typography.Text type="secondary">如不需要修改密码，可将该字段保持为空。</Typography.Text>

            <Typography.Text>备注</Typography.Text>
            <Input.TextArea
              maxLength={120}
              value={draft.note}
              onChange={(value) => setDraft((currentDraft) => (currentDraft ? { ...currentDraft, note: value } : currentDraft))}
              placeholder="可填写管理员职责或补充说明"
            />
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
};
