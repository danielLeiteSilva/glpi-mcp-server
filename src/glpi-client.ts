export interface GlpiConfig {
  baseUrl: string;
  appToken?: string;
  userToken?: string;
  username?: string;
  password?: string;
}

export interface SessionInfo {
  session_token: string;
}

export interface GlpiItem {
  id: number;
  [key: string]: unknown;
}

export interface SearchResult {
  totalcount: number;
  count: number;
  sort: number;
  order: string;
  data: GlpiItem[];
  'content-range': string;
}

export interface ListOptions {
  expand_dropdowns?: boolean;
  get_hateoas?: boolean;
  only_id?: boolean;
  range?: string;
  sort?: string;
  order?: 'ASC' | 'DESC';
  searchText?: Record<string, string>;
  is_deleted?: boolean;
  with_infocoms?: boolean;
  with_networkports?: boolean;
  with_attached_items?: boolean;
}

export interface SearchOptions {
  criteria?: SearchCriterion[];
  metacriteria?: SearchCriterion[];
  sort?: number;
  order?: 'ASC' | 'DESC';
  range?: string;
  forcedisplay?: number[];
  rawdata?: boolean;
  withindexes?: boolean;
  uid_cols?: boolean;
  giveItems?: boolean;
}

export interface SearchCriterion {
  link?: 'AND' | 'OR' | 'AND NOT' | 'OR NOT';
  field?: number;
  searchtype?: 'contains' | 'equals' | 'notequals' | 'lessthan' | 'morethan' | 'under' | 'notunder';
  value?: string;
  itemtype?: string;
  meta?: boolean;
}

export class GlpiClient {
  private baseUrl: string;
  private appToken?: string;
  private sessionToken?: string;

  constructor(config: GlpiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.appToken = config.appToken;
  }

  private buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extra,
    };
    if (this.appToken) {
      headers['App-Token'] = this.appToken;
    }
    if (this.sessionToken) {
      headers['Session-Token'] = this.sessionToken;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, unknown>,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          if (typeof value === 'object') {
            params.set(key, JSON.stringify(value));
          } else {
            params.set(key, String(value));
          }
        }
      }
      url += `?${params.toString()}`;
    }

    const headers = this.buildHeaders(extraHeaders);
    const options: RequestInit = { method, headers };

    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      let errorText = '';
      try {
        const errorData = await response.json() as unknown[];
        errorText = JSON.stringify(errorData);
      } catch {
        errorText = await response.text();
      }
      throw new Error(`GLPI API Error ${response.status}: ${errorText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  async initSession(options: {
    userToken?: string;
    username?: string;
    password?: string;
  }): Promise<SessionInfo> {
    const extraHeaders: Record<string, string> = {};

    if (options.userToken) {
      extraHeaders['Authorization'] = `user_token ${options.userToken}`;
    } else if (options.username && options.password) {
      const credentials = Buffer.from(`${options.username}:${options.password}`).toString('base64');
      extraHeaders['Authorization'] = `Basic ${credentials}`;
    } else {
      throw new Error('Either userToken or username+password must be provided');
    }

    const result = await this.request<SessionInfo>('GET', '/initSession', undefined, undefined, extraHeaders);
    this.sessionToken = result.session_token;
    return result;
  }

  async killSession(): Promise<void> {
    await this.request('GET', '/killSession');
    this.sessionToken = undefined;
  }

  async getMyProfiles(): Promise<unknown> {
    return this.request('GET', '/getMyProfiles');
  }

  async getActiveProfile(): Promise<unknown> {
    return this.request('GET', '/getActiveProfile');
  }

  async changeActiveProfile(profilesId: number): Promise<unknown> {
    return this.request('POST', '/changeActiveProfile', { profiles_id: profilesId });
  }

  async getMyEntities(isRecursive?: boolean): Promise<unknown> {
    return this.request('GET', '/getMyEntities', undefined, {
      is_recursive: isRecursive,
    });
  }

  async getActiveEntities(): Promise<unknown> {
    return this.request('GET', '/getActiveEntities');
  }

  async changeActiveEntities(entitiesId: number | 'all', isRecursive?: boolean): Promise<unknown> {
    return this.request('POST', '/changeActiveEntities', {
      entities_id: entitiesId,
      is_recursive: isRecursive,
    });
  }

  async getFullSession(): Promise<unknown> {
    return this.request('GET', '/getFullSession');
  }

  async getGlpiConfig(): Promise<unknown> {
    return this.request('GET', '/getGlpiConfig');
  }

  async getItem(itemtype: string, id: number, options?: {
    expandDropdowns?: boolean;
    getHateoas?: boolean;
    getSha1?: boolean;
    withDevices?: boolean;
    withDisks?: boolean;
    withSoftwares?: boolean;
    withConnections?: boolean;
    withNetworkports?: boolean;
    withInfocoms?: boolean;
    withContracts?: boolean;
    withDocuments?: boolean;
    withTickets?: boolean;
    withProblems?: boolean;
    withChanges?: boolean;
    withNotes?: boolean;
    withLogs?: boolean;
    withTags?: boolean;
  }): Promise<GlpiItem> {
    const params: Record<string, unknown> = {};
    if (options?.expandDropdowns !== undefined) params['expand_dropdowns'] = options.expandDropdowns;
    if (options?.getHateoas !== undefined) params['get_hateoas'] = options.getHateoas;
    if (options?.getSha1 !== undefined) params['get_sha1'] = options.getSha1;
    if (options?.withDevices !== undefined) params['with_devices'] = options.withDevices;
    if (options?.withDisks !== undefined) params['with_disks'] = options.withDisks;
    if (options?.withSoftwares !== undefined) params['with_softwares'] = options.withSoftwares;
    if (options?.withConnections !== undefined) params['with_connections'] = options.withConnections;
    if (options?.withNetworkports !== undefined) params['with_networkports'] = options.withNetworkports;
    if (options?.withInfocoms !== undefined) params['with_infocoms'] = options.withInfocoms;
    if (options?.withContracts !== undefined) params['with_contracts'] = options.withContracts;
    if (options?.withDocuments !== undefined) params['with_documents'] = options.withDocuments;
    if (options?.withTickets !== undefined) params['with_tickets'] = options.withTickets;
    if (options?.withProblems !== undefined) params['with_problems'] = options.withProblems;
    if (options?.withChanges !== undefined) params['with_changes'] = options.withChanges;
    if (options?.withNotes !== undefined) params['with_notes'] = options.withNotes;
    if (options?.withLogs !== undefined) params['with_logs'] = options.withLogs;
    if (options?.withTags !== undefined) params['with_tags'] = options.withTags;

    return this.request<GlpiItem>('GET', `/${itemtype}/${id}`, undefined, params);
  }

  async listItems(itemtype: string, options?: ListOptions): Promise<GlpiItem[]> {
    const params: Record<string, unknown> = {};
    if (options?.expand_dropdowns !== undefined) params['expand_dropdowns'] = options.expand_dropdowns;
    if (options?.get_hateoas !== undefined) params['get_hateoas'] = options.get_hateoas;
    if (options?.only_id !== undefined) params['only_id'] = options.only_id;
    if (options?.range !== undefined) params['range'] = options.range;
    if (options?.sort !== undefined) params['sort'] = options.sort;
    if (options?.order !== undefined) params['order'] = options.order;
    if (options?.searchText !== undefined) params['searchText'] = options.searchText;
    if (options?.is_deleted !== undefined) params['is_deleted'] = options.is_deleted;
    if (options?.with_infocoms !== undefined) params['with_infocoms'] = options.with_infocoms;
    if (options?.with_networkports !== undefined) params['with_networkports'] = options.with_networkports;
    if (options?.with_attached_items !== undefined) params['with_attached_items'] = options.with_attached_items;

    return this.request<GlpiItem[]>('GET', `/${itemtype}`, undefined, params);
  }

  async createItem(itemtype: string, input: Record<string, unknown> | Record<string, unknown>[]): Promise<unknown> {
    return this.request('POST', `/${itemtype}`, { input });
  }

  async updateItem(itemtype: string, id: number, input: Record<string, unknown>): Promise<unknown> {
    return this.request('PUT', `/${itemtype}/${id}`, { input });
  }

  async updateItems(itemtype: string, input: Array<Record<string, unknown> & { id: number }>): Promise<unknown> {
    return this.request('PUT', `/${itemtype}`, { input });
  }

  async deleteItem(itemtype: string, id: number, options?: {
    forcePurge?: boolean;
    history?: boolean;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {};
    if (options?.forcePurge !== undefined) params['force_purge'] = options.forcePurge;
    if (options?.history !== undefined) params['history'] = options.history;

    return this.request('DELETE', `/${itemtype}/${id}`, undefined, params);
  }

  async deleteItems(itemtype: string, ids: number[], options?: {
    forcePurge?: boolean;
    history?: boolean;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {};
    if (options?.forcePurge !== undefined) params['force_purge'] = options.forcePurge;
    if (options?.history !== undefined) params['history'] = options.history;

    return this.request('DELETE', `/${itemtype}`, { input: ids.map((id) => ({ id })) }, params);
  }

  async getSubItems(itemtype: string, id: number, subItemType: string, options?: {
    expandDropdowns?: boolean;
    getHateoas?: boolean;
    onlyId?: boolean;
    range?: string;
    sort?: string;
    order?: 'ASC' | 'DESC';
  }): Promise<GlpiItem[]> {
    const params: Record<string, unknown> = {};
    if (options?.expandDropdowns !== undefined) params['expand_dropdowns'] = options.expandDropdowns;
    if (options?.getHateoas !== undefined) params['get_hateoas'] = options.getHateoas;
    if (options?.onlyId !== undefined) params['only_id'] = options.onlyId;
    if (options?.range !== undefined) params['range'] = options.range;
    if (options?.sort !== undefined) params['sort'] = options.sort;
    if (options?.order !== undefined) params['order'] = options.order;

    return this.request<GlpiItem[]>('GET', `/${itemtype}/${id}/${subItemType}`, undefined, params);
  }

  async search(itemtype: string, options?: SearchOptions): Promise<SearchResult> {
    const params: Record<string, unknown> = {};
    if (options?.criteria) params['criteria'] = options.criteria;
    if (options?.metacriteria) params['metacriteria'] = options.metacriteria;
    if (options?.sort !== undefined) params['sort'] = options.sort;
    if (options?.order !== undefined) params['order'] = options.order;
    if (options?.range !== undefined) params['range'] = options.range;
    if (options?.forcedisplay !== undefined) params['forcedisplay'] = options.forcedisplay;
    if (options?.rawdata !== undefined) params['rawdata'] = options.rawdata;
    if (options?.withindexes !== undefined) params['withindexes'] = options.withindexes;
    if (options?.uid_cols !== undefined) params['uid_cols'] = options.uid_cols;
    if (options?.giveItems !== undefined) params['giveItems'] = options.giveItems;

    return this.request<SearchResult>('GET', `/search/${itemtype}`, undefined, params);
  }

  async listSearchOptions(itemtype: string): Promise<unknown> {
    return this.request('GET', `/listSearchOptions/${itemtype}`);
  }

  setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  getSessionToken(): string | undefined {
    return this.sessionToken;
  }

  hasSession(): boolean {
    return !!this.sessionToken;
  }
}
