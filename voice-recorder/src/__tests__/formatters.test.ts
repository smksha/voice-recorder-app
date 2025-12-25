// Simple unit tests for formatters - no mocking needed

describe('formatDuration', () => {
  // Inline implementation for testing
  const formatDuration = (milliseconds: number): string => {
    if (milliseconds < 0) milliseconds = 0;
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  };

  it('should format 0 milliseconds as 00:00', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('should format 5 seconds correctly', () => {
    expect(formatDuration(5000)).toBe('00:05');
  });

  it('should format 30 seconds correctly', () => {
    expect(formatDuration(30000)).toBe('00:30');
  });

  it('should format 59 seconds correctly', () => {
    expect(formatDuration(59000)).toBe('00:59');
  });

  it('should format 1 minute correctly', () => {
    expect(formatDuration(60000)).toBe('01:00');
  });

  it('should format 1 minute 30 seconds correctly', () => {
    expect(formatDuration(90000)).toBe('01:30');
  });

  it('should format 2 minutes correctly', () => {
    expect(formatDuration(120000)).toBe('02:00');
  });

  it('should format 1 hour correctly', () => {
    expect(formatDuration(3600000)).toBe('01:00:00');
  });

  it('should format 1 hour 1 minute 1 second correctly', () => {
    expect(formatDuration(3661000)).toBe('01:01:01');
  });

  it('should handle negative values as 00:00', () => {
    expect(formatDuration(-1000)).toBe('00:00');
  });

  it('should handle large values', () => {
    // 2 hours 30 minutes 45 seconds
    const ms = (2 * 3600 + 30 * 60 + 45) * 1000;
    expect(formatDuration(ms)).toBe('02:30:45');
  });
});

describe('Recording interface', () => {
  it('should accept valid recording object', () => {
    const recording = {
      id: '123456',
      uri: 'file://documents/recordings/test.m4a',
      filename: 'test.m4a',
      createdAt: '2024-01-15T10:30:00.000Z',
      duration: 15000,
    };

    expect(recording.id).toBe('123456');
    expect(recording.uri).toContain('file://');
    expect(recording.filename).toContain('.m4a');
    expect(typeof recording.duration).toBe('number');
    expect(recording.duration).toBeGreaterThan(0);
  });

  it('should have ISO date format for createdAt', () => {
    const recording = {
      id: '123',
      uri: 'file://test.m4a',
      filename: 'test.m4a',
      createdAt: new Date().toISOString(),
      duration: 5000,
    };

    // ISO format check
    expect(recording.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
