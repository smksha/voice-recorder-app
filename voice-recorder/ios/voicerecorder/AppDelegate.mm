#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <React/RCTBridge.h>
#import <React/RCTEventDispatcher.h>

@interface AppDelegate ()
@property (nonatomic) UIBackgroundTaskIdentifier backgroundTask;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"main";
  self.backgroundTask = UIBackgroundTaskInvalid;

  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

// Called when app enters background - request extended execution time
- (void)applicationDidEnterBackground:(UIApplication *)application
{
  NSLog(@"AppDelegate: applicationDidEnterBackground - starting background task");
  
  // Request extended background execution time (up to ~30 seconds)
  self.backgroundTask = [application beginBackgroundTaskWithName:@"SaveRecording" expirationHandler:^{
    // This is called when iOS is about to suspend the app
    // Post notification to JavaScript to save recording immediately
    NSLog(@"AppDelegate: Background task expiring - posting save notification");
    [[NSNotificationCenter defaultCenter] postNotificationName:@"BackgroundTaskExpiring" object:nil];
    
    // End the background task
    [application endBackgroundTask:self.backgroundTask];
    self.backgroundTask = UIBackgroundTaskInvalid;
  }];
}

// Called when app returns to foreground - cancel background task
- (void)applicationWillEnterForeground:(UIApplication *)application
{
  NSLog(@"AppDelegate: applicationWillEnterForeground - cancelling background task");
  
  if (self.backgroundTask != UIBackgroundTaskInvalid) {
    [[UIApplication sharedApplication] endBackgroundTask:self.backgroundTask];
    self.backgroundTask = UIBackgroundTaskInvalid;
  }
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Linking API
- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options {
  return [super application:application openURL:url options:options] || [RCTLinkingManager application:application openURL:url options:options];
}

// Universal Links
- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler {
  BOOL result = [RCTLinkingManager application:application continueUserActivity:userActivity restorationHandler:restorationHandler];
  return [super application:application continueUserActivity:userActivity restorationHandler:restorationHandler] || result;
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
  return [super application:application didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
  return [super application:application didFailToRegisterForRemoteNotificationsWithError:error];
}

// Explicitly define remote notification delegates to ensure compatibility with some third-party libraries
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  return [super application:application didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];
}

@end
